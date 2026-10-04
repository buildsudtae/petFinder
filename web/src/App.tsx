import { Route, Routes } from 'react-router-dom'

import { RequireAuth } from './auth'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { NewReport } from './pages/NewReport'
import { NewSightingPage } from './pages/NewSightingPage'
import { Register } from './pages/Register'
import { Relay } from './pages/Relay'
import { ReportDetail } from './pages/ReportDetail'
import { ReportList } from './pages/ReportList'

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ReportList />} />
        <Route path="reports" element={<ReportList />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="me/reports" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="reports/new" element={<RequireAuth><NewReport /></RequireAuth>} />
        <Route path="reports/:id" element={<ReportDetail />} />
        <Route path="reports/:id/sighting" element={<RequireAuth><NewSightingPage /></RequireAuth>} />
        <Route path="reports/:id/messages" element={<RequireAuth><Relay /></RequireAuth>} />
        <Route path="*" element={<p>ไม่พบหน้าที่ต้องการ <a href="/">กลับหน้าแรก</a></p>} />
      </Route>
    </Routes>
  )
}
