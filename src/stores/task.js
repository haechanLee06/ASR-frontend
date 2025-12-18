import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTaskStore = defineStore('task', () => {
  const tasks = ref([])

  function addTask(task) {
    // Add to beginning of list
    tasks.value.unshift(task)
  }

  function updateTask(id, info) {
    const task = tasks.value.find(t => t.record_id === id)
    if (task) {
      // Merge updates
      Object.assign(task, info)
    }
  }

  function removeTask(id) {
    const index = tasks.value.findIndex(t => t.record_id === id)
    if (index !== -1) {
      tasks.value.splice(index, 1)
    }
  }

  return {
    tasks,
    addTask,
    updateTask,
    removeTask
  }
})
