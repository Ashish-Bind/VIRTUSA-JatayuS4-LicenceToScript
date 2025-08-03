import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ClockLoader from './ClockLoader'

const ProtectedRoute = ({ allowedRoles = [], redirectPath = '/' }) => {
  const { user, loading } = useAuth()

  if (loading) return <ClockLoader />

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectPath} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
