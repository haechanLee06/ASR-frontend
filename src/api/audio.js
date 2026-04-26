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

export const updateSegmentSpeaker = (recordId, segmentIndex, speaker) => {
  return request.put(`/record/${recordId}/segment/${segmentIndex}/speaker`, { speaker })
}

export const splitSegment = (recordId, segmentIndex, splitOffset) => {
  // Increase timeout since secondary transcription takes a few seconds
  return request.post(`/record/${recordId}/segment/${segmentIndex}/split`, { split_offset: splitOffset }, { timeout: 120000 })
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

export const sendHeartbeat = () => {
  return request.post('/api/system/heartbeat')
}

export const updateRecordTitle = (id, title) => {
  return request.put(`/record/${id}/title`, { title })
}

// ─── 声纹库 ──────────────────────────────────────────────────────────────

export const getVoiceprintList = () => {
  return request.get('/api/voiceprint/list')
}

export const enrollVoiceprint = (personName, file) => {
  const formData = new FormData()
  formData.append('person_name', personName)
  formData.append('file', file)
  return request.post('/api/voiceprint/enroll', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000 // Voiceprint processing might take a moment
  })
}

export const deleteVoiceprint = (id) => {
  return request.delete(`/api/voiceprint/${id}`)
}

export const getMatchSuggestions = (recordId) => {
  return request.get(`/api/voiceprint/match_suggestions/${recordId}`)
}

export const applyVoiceprintMapping = (recordId, mapping) => {
  return request.post(`/api/voiceprint/apply_mapping/${recordId}`, { mapping })
}

export const getVoiceprintHistory = (id) => {
  return request.get(`/api/voiceprint/${id}/history`)
}

export const updateVoiceprint = (id, newName) => {
  return request.put(`/api/voiceprint/${id}`, { person_name: newName })
}
