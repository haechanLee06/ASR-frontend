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
