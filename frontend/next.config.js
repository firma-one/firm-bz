/** @type {import('next').NextConfig} */
const path = require("path");
const createMDX = require('@next/mdx')

// Conditionally require Sentry (may not be installed)
let withSentryConfig;
try {
  const sentryModule = require("@sentry/nextjs");
  withSentryConfig = sentryModule.withSentryConfig;
} catch (e) {
  // Sentry not available, will skip Sentry wrapper
  withSentryConfig = null;
}

const withMDX = createMDX({
  // Add markdown plugins here, as desired
})

const nextConfig = {
  // Removed 'output: export' to support dynamic API routes
  // trailingSlash: true, // Temporarily disabled to fix API routing
  images: {
    unoptimized: true
  },
  // Allow Tailscale dev origins for HMR (hot module reloading)
  allowedDevOrigins: ['macbook-air.tail48717e.ts.net'],
  // Configure `pageExtensions` to include MDX files
  pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],

  async redirects() {
    return [
      { source: '/solutions', destination: '/', permanent: true },
      { source: '/solutions/consulting', destination: '/', permanent: true },
      { source: '/solutions/accounting', destination: '/', permanent: true },
      { source: '/solutions/:path*', destination: '/', permanent: true },
      { source: '/firma-redesign', destination: '/', permanent: true },
      { source: '/firma-redesign/:path*', destination: '/', permanent: true },
      { source: '/resources', destination: '/resources/faq', permanent: true },
      { source: '/docs', destination: '/resources/docs', permanent: true },
      { source: '/docs/:path*', destination: '/resources/docs/:path*', permanent: true },
      { source: '/faq', destination: '/resources/faq', permanent: true },
      { source: '/trust-center', destination: '/resources/trust-center', permanent: true },
      { source: '/blog', destination: '/resources/blog', permanent: true },
      { source: '/blog/:path*', destination: '/resources/blog/:path*', permanent: true },
    ]
  },

  async rewrites() {
    return [
      {
        source: '/',
        destination: '/d',
        has: [{ type: 'host', value: 'datasentry.firma.bz' }],
      },
      {
        source: '/',
        destination: '/d',
        has: [{ type: 'host', value: 'app.firma.bz' }],
      },
    ]
  },

  // Experimental features for faster compilation
  experimental: {
    // Optimize package imports - reduces compilation time
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-avatar',
      '@radix-ui/react-label',
      '@radix-ui/react-progress',
      'framer-motion',
      'recharts',
      'fuse.js',
      'date-fns',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
      'react-markdown',
    ],
  },

  // Configure webpack
  webpack: (config, { isServer, dev }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "sharp$": false,
      "onnxruntime-node$": false,
    }

    // Dev mode optimizations for faster HMR (hot reload)
    if (dev) {
      // PHASE 1: Enhanced webpack cache for faster HMR
      // Caches compiled modules to skip recompilation on unchanged code
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
          // Invalidate cache when dependencies change
          packageJson: [path.resolve(process.cwd(), 'package.json')],
        },
        cacheDirectory: path.resolve(process.cwd(), '.next/cache/webpack'),
        // Use fast hashing algorithm for quicker cache lookups
        hashAlgorithm: 'md4',
        // Named cache for clarity in debugging
        name: 'webpack-dev-cache',
      };

      // Note: Not setting devtool - Next.js manages this automatically
      // Changing devtool causes performance regressions per Next.js warnings

      // PHASE 2: Reduce module compilation overhead for faster HMR
      // These settings tell webpack to skip expensive optimization passes during dev
      config.optimization = {
        ...config.optimization,
        removeAvailableModules: false,  // Skip unused module removal
        removeEmptyChunks: false,       // Skip empty chunk removal
        splitChunks: false,             // Disable code splitting (single chunk = faster compile)
        minimize: false,                // No minification in dev (saves ~30-40% build time)
        concatenateModules: false,      // Disable module concatenation (less work per change)
        providedExports: false,         // Skip export optimization
        usedExports: false,             // Skip tree-shaking (only needed for prod)
      };

      // File system watcher optimization for faster HMR detection
      config.watchOptions = {
        poll: false,                    // Disable polling (use native file system events)
        aggregateTimeout: 300,          // Wait 300ms after file change before rebuilding
        ignored: /node_modules/,        // Don't watch node_modules (massive performance boost)
      };

      // Faster module resolution by skipping symlink checks
      config.resolve.symlinks = false;

      // Reduce file system calls by caching dependency tree
      config.snapshot = {
        ...config.snapshot,
        managedPaths: [path.resolve(process.cwd(), 'node_modules')],
        // Cache module timestamps for faster invalidation checking
        immutablePaths: [],
        buildDependencies: {
          timestamp: true,
          hash: true,
        },
      };

      // Silence "Critical dependency" warnings from Prisma/OpenTelemetry in dev
      config.ignoreWarnings = [
        { module: /node_modules\/@opentelemetry\/instrumentation/ }
      ];

      // Exclude heavy libraries from client bundles when possible
      if (!isServer) {
        config.resolve.alias = {
          ...config.resolve.alias,
          // These are server-only, exclude from client bundle
          'nodemailer$': false,
        };
      }

      // OPTIONAL PHASE 4: Additional performance tuning
      // Uncomment if certain routes are still slow to reload
      // config.optimization.providedExports = false;  // Already set above
      // config.optimization.usedExports = false;      // Already set above

      // Summary of dev optimizations for HMR:
      // ✅ Enhanced filesystem caching with granular invalidation
      // ✅ File watcher configured for fast change detection (300ms debounce)
      // ✅ No minification, code splitting, or module concatenation
      // ✅ No tree-shaking or export analysis (saves compilation time)
      // ✅ Fast module resolution (no symlink checks)
      // ✅ node_modules excluded from file watcher (prevents slowdowns)
      // Expected HMR improvement: 40-60% faster hot reloads
    }

    return config;
  },

}

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps in production
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Transpiles SDK to be compatible with IE11 (increases bundle size)
  transpileClientSDK: false,

  // Creates source maps
  hideSourceMaps: true,
};

// Make sure adding Sentry options is the last code to run before exporting
// Apply MDX wrapper first, then Sentry wrapper (if available)
const configWithMDX = withMDX(nextConfig);
if (process.env.NODE_ENV === 'development' || !withSentryConfig) {
  module.exports = configWithMDX;
} else {
  module.exports = withSentryConfig(
    configWithMDX,
    {
      ...sentryWebpackPluginOptions,
    },
    {
      // The new webpack tree-shaking and integration options belong in the 3rd argument for Sentry v8 Next.js SDK
      automaticVercelMonitors: true,
      transpileClientSDK: false,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true, // Let Sentry SDK manage the webpack mapping implicitly if needed, or stick to default options here
    }
  );
}
