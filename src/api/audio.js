import request from './request'

export function uploadAudio(file) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export const getDetail = (id) => {
  return request.get(`/record/${id}`)
}

export const deleteRecord = (id) => {
  return request.delete(`/record/${id}`)
}

export const getTranscriptData = (id) => {
  return request.get(`/api/transcript_data/${id}`)
}

export const updateSegmentText = (recordId, segmentIndex, text) => {
  return request.put(`/record/${recordId}/segment/${segmentIndex}`, { text })
}

export const generateSummary = (id) => {
  return request.post(`/api/summary/${id}`, {}, { timeout: 300000 })
}

export const getDashboardAmbient = () => {
  return request.get('/api/dashboard/ambient')
}

export const getDashboardHealth = () => {
  return request.get('/api/dashboard/health')
}
export const getDashboardStats = () => {
  return request.get('/api/dashboard/stats')
}

export const getDashboardKeywords = () => {
  return request.get('/api/dashboard/keywords')
}

export const getDashboardRecentRecords = () => {
  return request.get('/api/dashboard/recent_records')
}
