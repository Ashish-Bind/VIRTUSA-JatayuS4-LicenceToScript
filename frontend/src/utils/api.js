// src/utils/api.js
export const api = {
  async post(url, data) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include', // Important for sessions to work
    })
    return await response.json()
  },
}

const SERVER = 'http://localhost:5000'

export const authApi = {
  signup: (data) => api.post(`${SERVER}/api/auth/signup`, data),
  login: (data) => api.post(`${SERVER}/api/auth/login`, data),
  // Add other auth-related endpoints here
}
