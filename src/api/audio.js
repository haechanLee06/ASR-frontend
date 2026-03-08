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
  return request.post(`/api/summary/${id}`, {}, { timeout: 120000 })
}
