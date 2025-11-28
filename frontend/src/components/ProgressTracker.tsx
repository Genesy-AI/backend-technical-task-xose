import { useEffect, useState } from 'react'
import io from 'socket.io-client'

interface ProgressEvent {
  type: 'findPhone' | 'verifyEmail'
  leadId?: number
  total?: number
  started?: boolean
  status?: 'completed' | 'error'
  message?: string
}

interface ActiveTask {
  id: string
  type: string
  total: number
  success: number
  failed: number
  pending: number
  items: ProgressEvent[]
}

const getTaskLabel = (type: string) => {
  switch (type) {
    case 'findPhone':
      return 'Find Phone'
    case 'verifyEmail':
      return 'Verify Email'
    default:
      return type
  }
}

const getTaskIcon = (type: string) => {
  switch (type) {
    case 'findPhone':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        </svg>
      )
    case 'verifyEmail':
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      )
    default:
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
  }
}

export const ProgressTracker = () => {
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([])
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    const socket = io('http://localhost:4000')

    socket.on('progress', (data: ProgressEvent) => {
      setActiveTasks((prevTasks) => {
        const taskId = `${data.type}-${Date.now()}` // Simple ID for demo; in real app, use unique ID from backend

        if (data.started && data.total) {
          // Clean up completed tasks before starting new one
          const cleanedTasks = prevTasks.filter((task) => task.success + task.failed !== task.total)
          // Start new task
          const newTask: ActiveTask = {
            id: taskId,
            type: data.type,
            total: data.total,
            success: 0,
            failed: 0,
            pending: data.total,
            items: [data],
          }
          return [...cleanedTasks, newTask]
        } else {
          // Update existing task
          return prevTasks.map((task) => {
            if (task.type === data.type) {
              const newItems = [...task.items, data]
              let newSuccess = task.success
              let newFailed = task.failed
              let newPending = task.pending

              if (data.status === 'completed') {
                newSuccess += 1
                newPending -= 1
              } else if (data.status === 'error') {
                newFailed += 1
                newPending -= 1
              }

              return {
                ...task,
                success: newSuccess,
                failed: newFailed,
                pending: newPending,
                items: newItems,
              }
            }
            return task
          })
        }
      })
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  if (activeTasks.length === 0) return null

  const completedTasks = activeTasks.filter((task) => task.success + task.failed === task.total).length
  const totalTasks = activeTasks.length

  return (
    <div
      className={`bg-gradient-to-r ${completedTasks === totalTasks ? 'from-green-50 to-emerald-50 border-green-200' : 'from-blue-50 to-indigo-50 border-blue-200'} border rounded-lg shadow-sm mb-6`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-4 py-3 text-left flex items-center justify-between transition-all duration-200 rounded-t-lg cursor-pointer ${completedTasks === totalTasks ? 'hover:from-green-100 hover:to-emerald-100' : 'hover:from-blue-100 hover:to-indigo-100'}`}
      >
        <div className="flex items-center">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-full mr-3 ${completedTasks === totalTasks ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-900">
            {completedTasks === totalTasks
              ? 'All enrichment tasks completed'
              : `Processing ${totalTasks} enrichment task${totalTasks !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="flex items-center">
          <span className="text-xs text-gray-600 mr-2">
            {completedTasks} / {totalTasks} completed
          </span>
          <svg
            className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {activeTasks.map((task) => {
            const progressPercentage = ((task.success + task.failed) / task.total) * 100
            return (
              <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <div className="flex items-center justify-center w-10 h-10 bg-blue-100 text-blue-600 rounded-full mr-3">
                      {getTaskIcon(task.type)}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">{getTaskLabel(task.type)}</h4>
                      <p className="text-xs text-gray-600">{task.total} leads to enrich</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      ✓ {task.success}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      ✗ {task.failed}
                    </span>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      ⏳ {task.pending}
                    </span>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>Progress</span>
                    <span>{Math.round(progressPercentage)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progressPercentage}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
