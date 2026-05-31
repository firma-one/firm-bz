"use client"
import { useState, useEffect, useRef } from "react"
import { FolderOpen, SquareX } from "lucide-react"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Button } from "@/components/ui/button"
import { FAQ_DATA, FAQItem } from "@/data/faq-data"
import { BrandName } from "@/components/brand/BrandName"

interface FAQModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FAQModal({ isOpen, onClose }: FAQModalProps) {
  // FAQ Animation State
  const [messages, setMessages] = useState<Array<{ id: string, type: 'user' | 'assistant', content: string }>>([])
  const [inputText, setInputText] = useState('')
  const [isTypingInput, setIsTypingInput] = useState(false)
  const [showSpinner, setShowSpinner] = useState(false)
  const [isTypingResponse, setIsTypingResponse] = useState(false)
  const [currentTypedResponse, setCurrentTypedResponse] = useState('')
  const [hasSeenAnimation, setHasSeenAnimation] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Only scroll within the FAQ container, not the whole page
  useEffect(() => {
    if (messages.length > 0 || currentTypedResponse) {
      scrollToBottom()
    }
  }, [messages, currentTypedResponse])

  // Check localStorage on component mount
  useEffect(() => {
    const seenAnimation = localStorage.getItem('fm-faq-animation-seen')
    if (seenAnimation === 'true') {
      setHasSeenAnimation(true)
      // Load all FAQ content immediately
      const allMessages: Array<{ id: string, type: 'user' | 'assistant', content: string }> = []
      FAQ_DATA.forEach((faq, index) => {
        allMessages.push({
          id: `q-${index}-static`,
          type: 'user',
          content: faq.question
        })
        allMessages.push({
          id: `a-${index}-static`,
          type: 'assistant',
          content: faq.answer
        })
      })
      setMessages(allMessages)
    }
  }, [])

  // Mark animation as seen and store in localStorage
  const markAnimationSeen = () => {
    localStorage.setItem('fm-faq-animation-seen', 'true')
    setHasSeenAnimation(true)
  }

  useEffect(() => {
    if (!isOpen || hasSeenAnimation) return // Don't run animation if modal is closed or user has seen it

    let isActive = true

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    const typeText = async (text: string, delayMs: number, setter: (text: string) => void) => {
      for (let i = 0; i <= text.length && isActive; i++) {
        if (i < text.length) {
          setter(text.slice(0, i + 1))
          await delay(delayMs)
        }
      }
    }

    const runSingleCycle = async () => {
      // Run through all FAQs once, then stop and mark as seen
      for (let qIndex = 0; qIndex < FAQ_DATA.length && isActive && isOpen; qIndex++) {
        const currentFaq = FAQ_DATA[qIndex]

        // Phase 1: Type question in input
        setIsTypingInput(true)
        setInputText('')

        await typeText(currentFaq.question, 80, setInputText)

        if (!isActive || !isOpen) break

        // Phase 2: Send message
        setIsTypingInput(false)
        await delay(600)

        if (!isActive || !isOpen) break

        // Add question to messages
        const questionId = `q-${qIndex}-${Date.now()}`
        setMessages(prev => [...prev, { id: questionId, type: 'user', content: currentFaq.question }])
        setInputText('')

        // Phase 3: Show thinking spinner
        setShowSpinner(true)
        await delay(800)

        if (!isActive || !isOpen) break

        setShowSpinner(false)

        // Phase 4: Type response
        setIsTypingResponse(true)
        setCurrentTypedResponse('')

        await typeText(currentFaq.answer, 30, setCurrentTypedResponse)

        if (!isActive || !isOpen) break

        // Phase 5: Finish response
        setIsTypingResponse(false)
        const responseId = `a-${qIndex}-${Date.now()}`
        setMessages(prev => [...prev, { id: responseId, type: 'assistant', content: currentFaq.answer }])
        setCurrentTypedResponse('')

        // Wait before next question
        await delay(2500)
      }

      // Mark as seen after completing the full cycle
      if (isActive && isOpen) {
        markAnimationSeen()
      }
    }

    // Start the animation cycle (run only once)
    const startTimer = setTimeout(() => {
      if (isActive && isOpen) {
        runSingleCycle()
      }
    }, 1500)

    return () => {
      isActive = false
      clearTimeout(startTimer)
    }
  }, [isOpen, hasSeenAnimation]) // Depend on both isOpen and hasSeenAnimation

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] max-h-[800px] flex flex-col">
        {/* Modal Header - Fixed Height */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
          <div className="text-center flex-1">
            <h2 className="text-2xl font-bold text-gray-900">
              Frequently Asked Questions
            </h2>
            <p className="text-gray-600 mt-1">
              Everything you need to know about{' '}
              <BrandName className="font-medium" />
              &apos;s features, security, and Google Drive integration.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <SquareX className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* Chat Interface - Fixed Height Structure */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="bg-white shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col rounded-b-2xl">
            {/* Chat Header - Fixed Height */}
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center">
                    <FolderOpen className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      <BrandName className="font-semibold inline" /> Assistant
                    </h3>
                    <p className="text-xs text-gray-500">Online now</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-xs text-gray-600">Active</span>
                </div>
              </div>
            </div>

            {/* Chat Messages Container - Scrollable with Fixed Height */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="space-y-6 p-6 min-h-full">
                {/* Dynamic Messages */}
                {messages.map((message) => (
                  <div key={message.id} className="group hover:bg-gray-50/30 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className={`w-9 h-9 ${message.type === 'user'
                        ? 'bg-gradient-to-r from-gray-600 to-gray-700'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-500'} rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mt-2`}>
                        {message.type === 'user' ? (
                          <span className="text-white text-sm font-medium">You</span>
                        ) : (
                          <FolderOpen className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {message.type === 'user' ? (
                          <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow duration-200 max-w-2xl">
                            <div className="text-gray-900 text-base leading-6 font-medium">
                              {message.content}
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-800 text-base leading-7 max-w-2xl">
                            {message.content}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Typing Response */}
                {isTypingResponse && (
                  <div className="group hover:bg-gray-50/30 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="w-9 h-9 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mt-2">
                        <FolderOpen className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-800 text-base leading-7 max-w-2xl">
                          {currentTypedResponse}
                          <span className="inline-block w-2 h-5 bg-blue-500 ml-1 animate-pulse"></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Spinner */}
                {showSpinner && (
                  <div className="group hover:bg-gray-50/30 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="w-9 h-9 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm mt-2">
                        <FolderOpen className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-800 text-base leading-7 max-w-2xl flex items-center">
                          <LoadingSpinner size="sm" />
                          <span className="text-gray-500">
                            <BrandName className="!text-gray-500 font-medium text-sm" /> is thinking...
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Chat Input Area - Fixed Height */}
            <div className="border-t border-gray-200 bg-white p-4 flex-shrink-0 rounded-b-2xl">
              <div className="flex items-center space-x-3">
                <div className="flex-1 bg-gray-50 rounded-lg border border-gray-200 p-3 h-12 flex items-center">
                  <div className="text-gray-900 text-sm flex-1">
                    {inputText || (
                      <span className="text-gray-400">
                        Ask us anything about <BrandName className="text-sm font-medium inline" />
                        ...
                      </span>
                    )}
                    {isTypingInput && <span className="inline-block w-1 h-4 bg-gray-700 ml-1 animate-pulse"></span>}
                  </div>
                </div>
                <Button
                  className={`${inputText ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600' : 'bg-gray-300'
                    } text-white rounded-lg px-4 py-2 h-12 transition-colors duration-200 flex-shrink-0`}
                  disabled={!inputText}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}