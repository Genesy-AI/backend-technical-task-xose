import { useUser, UserTier } from '../contexts/UserContext'
import React, { useState, useRef, useEffect } from 'react'

const tierStyles = {
  [UserTier.FREE]: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
    icon: '⚪',
  },
  [UserTier.BASIC]: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: '🔵',
  },
  [UserTier.PREMIUM]: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: '💎',
  },
  [UserTier.ENTERPRISE]: {
    bg: 'bg-gradient-to-r from-emerald-50 to-teal-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    icon: '🏢',
  },
}

const tierOptions = [
  {
    value: UserTier.FREE,
    label: 'Free',
    ...tierStyles[UserTier.FREE],
  },
  {
    value: UserTier.BASIC,
    label: 'Basic',
    ...tierStyles[UserTier.BASIC],
  },
  {
    value: UserTier.PREMIUM,
    label: 'Premium',
    ...tierStyles[UserTier.PREMIUM],
  },
  {
    value: UserTier.ENTERPRISE,
    label: 'Enterprise',
    ...tierStyles[UserTier.ENTERPRISE],
  },
]

export const UserTierSelector: React.FC = () => {
  const { userTier, setUserTier } = useUser()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selected = tierOptions.find((t) => t.value === userTier)

  return (
    <div className="flex items-center gap-3">
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          className={`flex items-center gap-2 w-full min-w-[180px] px-5 py-3 pr-12 rounded-xl border ${selected?.border} ${selected?.bg} ${selected?.text} text-sm font-medium shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 backdrop-blur-sm cursor-pointer`}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="text-lg">{selected?.icon}</span>
          <span>{selected?.label}</span>
          <span className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full bg-white/20 backdrop-blur-sm">
            <svg
              className={`w-3.5 h-3.5 text-current opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>
        {open && (
          <ul
            className="absolute left-0 mt-2 z-20 w-full rounded-2xl shadow-xl border border-gray-200 bg-white transition-all duration-200 animate-fade-in backdrop-blur-lg"
            style={{ minWidth: 180 }}
            role="listbox"
          >
            {tierOptions.map((option) => (
              <li
                key={option.value}
                className={`flex items-center gap-2 px-5 py-3 cursor-pointer text-sm font-medium transition-all duration-150 ${option.text} ${userTier === option.value ? 'bg-blue-100' : 'hover:bg-gray-100'} ${option.value === UserTier.ENTERPRISE ? 'font-semibold' : ''}`}
                onClick={() => {
                  setUserTier(option.value as UserTier)
                  setOpen(false)
                }}
                role="option"
                aria-selected={userTier === option.value}
              >
                <span className="text-lg">{option.icon}</span>
                <span>{option.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
