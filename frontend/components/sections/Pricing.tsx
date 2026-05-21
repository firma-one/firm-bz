"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Users, CheckCircle, User, ArrowRight } from "lucide-react"
import { PRICING_PLANS } from "@/config/pricing"

export function Pricing() {
    return (
        <section id="pricing" className="py-16 px-4 bg-gradient-to-br from-gray-50 to-blue-50 relative overflow-visible z-0">
            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-10 right-20 w-64 h-64 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-10 left-20 w-64 h-64 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '3s' }}></div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative overflow-visible">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-800 rounded-full text-base font-semibold mb-8 shadow-sm border border-blue-200">
                        <Users className="h-5 w-5 mr-3" />
                        Built for freelancers, consultants & small agencies
                    </div>
                    <h2 className="text-3xl font-bold text-slate-800 mb-4 tracking-tight">
                        Simple Pricing for Every Stage
                    </h2>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto font-medium">
                        Flat pricing that grows with your business. No per-seat tax.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto items-start">
                    {PRICING_PLANS.map((plan) => (
                        <div
                            key={plan.id}
                            className={`relative bg-white rounded-3xl border shadow-sm transition-all duration-300 flex flex-col p-2 h-full group z-10
                            ${plan.theme === 'purple'
                                    ? 'border-purple-100 shadow-[0_0_40px_-10px_rgba(168,85,247,0.15)] ring-1 ring-purple-100 hover:shadow-[0_0_50px_-5px_rgba(168,85,247,0.25)] hover:border-purple-200'
                                    : 'border-slate-200 hover:shadow-xl'
                                }
                            ${plan.id === 'team' && 'border-blue-100 shadow-[0_0_40px_-10px_rgba(59,130,246,0.15)] ring-1 ring-blue-100 hover:shadow-[0_0_50px_-5px_rgba(59,130,246,0.25)] hover:border-blue-200'}
                            `}
                        >
                            {/* Inner Header Card */}
                            <div className={`rounded-2xl p-8 flex flex-col items-start text-left relative z-10 w-full overflow-hidden
                                ${plan.theme === 'purple' ? 'bg-purple-50' : (plan.id === 'team' ? 'bg-blue-50' : 'bg-slate-50')}
                            `}>
                                {/* Subtle Dotted Pattern Overlay for Purple Theme */}
                                {plan.theme === 'purple' && (
                                    <div className="absolute inset-0 z-0 opacity-30 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#d8b4fe 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
                                )}

                                <div className="relative z-10 w-full">
                                    <div className="flex justify-between w-full items-start mb-6">
                                        <div className={`w-14 h-14 bg-white rounded-2xl border flex items-center justify-center shadow-sm
                                            ${plan.theme === 'purple' ? 'border-purple-100' : (plan.id === 'team' ? 'border-blue-100' : 'border-slate-100')}
                                        `}>
                                            {plan.id === 'free' && <User className="h-7 w-7 text-slate-500" />}
                                            {plan.id === 'startup' && <User className="h-7 w-7 text-purple-500" />}
                                            {plan.id === 'team' && <Users className="h-7 w-7 text-blue-500" />}
                                        </div>
                                        {plan.popular && (
                                            <div className="bg-blue-50 text-blue-700 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border border-blue-100 shadow-sm">
                                                Recommended
                                            </div>
                                        )}
                                    </div>

                                    <h3 className="text-xl font-semibold text-slate-800 tracking-tight">{plan.title}</h3>
                                    <p className="text-slate-600 mt-2 text-base font-medium">{plan.description}</p>
                                    {plan.price && (
                                        <div className="mt-8 mb-8">
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-5xl font-bold text-slate-800 tracking-tight">{plan.price}</span>
                                                {plan.prevPrice && (
                                                    <span className="text-slate-400 text-2xl line-through font-medium">{plan.prevPrice}</span>
                                                )}
                                                <span className="text-slate-500 text-lg font-medium">{plan.duration}</span>
                                            </div>
                                        </div>
                                    )}
                                    {!plan.price && (
                                        <div className="mt-8 mb-8">
                                            <div className="h-[48px] flex items-center">
                                                <span className="text-xl font-medium text-slate-500">Custom pricing</span>
                                            </div>
                                        </div>
                                    )}
                                    <Link href={plan.href ?? '/contact'} className="w-full">
                                        <Button className={`w-full rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md hover:shadow-lg transition-all text-sm h-11 flex items-center justify-between px-6 group/btn
                                            ${plan.id === 'team' ? 'bg-slate-900 hover:bg-black' : ''}
                                            ${plan.theme === 'purple' ? 'shadow-blue-200' : ''}
                                        `}>
                                            {plan.cta}
                                            <ArrowRight className="ml-2 h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                                        </Button>
                                    </Link>
                                </div>
                            </div>

                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
