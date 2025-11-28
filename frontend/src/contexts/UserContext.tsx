import React, { createContext, useContext, useState, ReactNode } from 'react'

export enum UserTier {
  FREE = 0,
  BASIC = 1,
  PREMIUM = 2,
  ENTERPRISE = 3,
}

interface UserContextType {
  userTier: UserTier
  setUserTier: (tier: UserTier) => void
}

const UserContext = createContext<UserContextType | undefined>(undefined)

interface UserProviderProps {
  children: ReactNode
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [userTier, setUserTier] = useState<UserTier>(UserTier.ENTERPRISE)

  return <UserContext.Provider value={{ userTier, setUserTier }}>{children}</UserContext.Provider>
}

export const useUser = () => {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
