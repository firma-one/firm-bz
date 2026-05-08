import { Reminder, DueDateInfo } from './types'
import { formatFullDate } from './utils'

class ReminderStorageService {
  private readonly STORAGE_KEY = 'fm-reminders'

  // Initialize storage
  async initialize(): Promise<boolean> {
    try {
      if (typeof window === 'undefined') return false
      
      const existingReminders = localStorage.getItem(this.STORAGE_KEY)
      if (!existingReminders) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]))
      }
      
      return true
    } catch (error) {
      console.error('Failed to initialize reminder storage:', error)
      return false
    }
  }

  // Get all reminders
  async getReminders(): Promise<Reminder[]> {
    try {
      if (typeof window === 'undefined') return []
      
      const reminders = localStorage.getItem(this.STORAGE_KEY)
      return reminders ? JSON.parse(reminders) : []
    } catch (error) {
      console.error('Failed to get reminders:', error)
      return []
    }
  }

  // Get reminders for a specific document
  async getRemindersForDocument(documentId: string): Promise<Reminder[]> {
    const allReminders = await this.getReminders()
    return allReminders.filter(reminder => reminder.documentId === documentId)
  }

  // Get active (non-completed) reminders
  async getActiveReminders(): Promise<Reminder[]> {
    const allReminders = await this.getReminders()
    return allReminders.filter(reminder => !reminder.isCompleted)
  }

  // Get overdue reminders
  async getOverdueReminders(): Promise<Reminder[]> {
    const activeReminders = await this.getActiveReminders()
    const now = new Date()
    
    return activeReminders.filter(reminder => {
      const dueDate = new Date(reminder.dueDate)
      return dueDate < now
    })
  }

  // Get upcoming reminders (next 7 days)
  async getUpcomingReminders(): Promise<Reminder[]> {
    const activeReminders = await this.getActiveReminders()
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    return activeReminders.filter(reminder => {
      const dueDate = new Date(reminder.dueDate)
      return dueDate >= now && dueDate <= nextWeek
    })
  }

  // Add a new reminder
  async addReminder(reminder: Omit<Reminder, 'id' | 'createdAt'>): Promise<Reminder> {
    try {
      const newReminder: Reminder = {
        ...reminder,
        id: this.generateId(),
        createdAt: new Date().toISOString()
      }

      const existingReminders = await this.getReminders()
      const updatedReminders = [...existingReminders, newReminder]
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedReminders))
      
      return newReminder
    } catch (error) {
      console.error('Failed to add reminder:', error)
      throw error
    }
  }

  // Update an existing reminder
  async updateReminder(reminderId: string, updates: Partial<Reminder>): Promise<Reminder | null> {
    try {
      const reminders = await this.getReminders()
      const index = reminders.findIndex(r => r.id === reminderId)
      
      if (index === -1) return null
      
      reminders[index] = { ...reminders[index], ...updates }
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(reminders))
      
      return reminders[index]
    } catch (error) {
      console.error('Failed to update reminder:', error)
      throw error
    }
  }

  // Mark reminder as completed
  async markReminderCompleted(reminderId: string): Promise<Reminder | null> {
    return this.updateReminder(reminderId, { isCompleted: true })
  }

  // Delete a reminder
  async deleteReminder(reminderId: string): Promise<boolean> {
    try {
      const reminders = await this.getReminders()
      const filteredReminders = reminders.filter(r => r.id !== reminderId)
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredReminders))
      return true
    } catch (error) {
      console.error('Failed to delete reminder:', error)
      return false
    }
  }

  // Delete all reminders for a document
  async deleteRemindersForDocument(documentId: string): Promise<boolean> {
    try {
      const reminders = await this.getReminders()
      const filteredReminders = reminders.filter(r => r.documentId !== documentId)
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredReminders))
      return true
    } catch (error) {
      console.error('Failed to delete reminders for document:', error)
      return false
    }
  }

  // Calculate due date info
  calculateDueDateInfo(dueDate: string): DueDateInfo {
    const now = new Date()
    const due = new Date(dueDate)
    const diffTime = due.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    return {
      dueDate,
      isOverdue: diffTime < 0,
      daysUntilDue: diffDays,
      formattedDate: `${formatFullDate(due)}, ${due.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    }
  }

  // Generate unique ID
  private generateId(): string {
    return `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Get reminder statistics
  async getReminderStats(): Promise<{
    total: number
    active: number
    completed: number
    overdue: number
    upcoming: number
  }> {
    const allReminders = await this.getReminders()
    const activeReminders = await this.getActiveReminders()
    const overdueReminders = await this.getOverdueReminders()
    const upcomingReminders = await this.getUpcomingReminders()
    
    return {
      total: allReminders.length,
      active: activeReminders.length,
      completed: allReminders.length - activeReminders.length,
      overdue: overdueReminders.length,
      upcoming: upcomingReminders.length
    }
  }
}

// Create singleton instance
export const reminderStorage = new ReminderStorageService()

// Utility functions
export const formatReminderTime = (dueDate: string): string => {
  const date = new Date(dueDate)
  const now = new Date()
  const diffTime = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays < 0) {
    return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} overdue`
  } else if (diffDays === 0) {
    return 'Due today'
  } else if (diffDays === 1) {
    return 'Due tomorrow'
  } else if (diffDays <= 7) {
    return `Due in ${diffDays} days`
  } else {
    return formatFullDate(date)
  }
}

export const getReminderPriority = (dueDate: string): 'low' | 'medium' | 'high' | 'urgent' => {
  const date = new Date(dueDate)
  const now = new Date()
  const diffTime = date.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffTime < 0) return 'urgent' // Overdue
  if (diffDays <= 1) return 'high' // Due today or tomorrow
  if (diffDays <= 3) return 'medium' // Due in 2-3 days
  return 'low' // Due in more than 3 days
}
