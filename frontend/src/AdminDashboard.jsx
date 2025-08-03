import React, { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import { baseUrl } from './utils/utils'
import {
  Shield,
  BarChart2,
  Users,
  FileText,
  Edit2,
  Trash2,
  Plus,
  DollarSign,
  TrendingUp,
  Activity,
  Eye,
  Search,
  Filter,
} from 'lucide-react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import ClockLoader from './components/ClockLoader'
import toast from 'react-hot-toast'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

const AdminDashboard = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [planFilter, setPlanFilter] = useState('All')
  const [editClientId, setEditClientId] = useState(null)
  const [editForm, setEditForm] = useState({
    company: '',
    phone: '',
    status: '',
    plan: '',
    logo: null,
  })
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
    phone: '',
  })
  const [logoFile, setLogoFile] = useState(null)
  const [editLogoFile, setEditLogoFile] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [salesData, setSalesData] = useState([])
  const [subscriptionPlans, setSubscriptionPlans] = useState([])

  useEffect(() => {
    if (!user || user.role !== 'superadmin') {
      navigate('/superadmin/login')
    } else {
      Promise.all([fetchClients(), fetchSales(), fetchSubscriptionPlans()])
        .then(() => setLoading(false))
        .catch((err) => {
          setError(err.message)
          setLoading(false)
        })
    }
  }, [user, navigate])

  const fetchClients = async () => {
    try {
      const response = await fetch(`${baseUrl}/superadmin/clients`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to fetch clients')
      const data = await response.json()
      setClients(data)
    } catch (err) {
      setError(err.message)
    }
  }

  const fetchSales = async () => {
    try {
      const response = await fetch(`${baseUrl}/superadmin/sales`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to fetch sales data')
      const data = await response.json()
      setSalesData(data)
    } catch (err) {
      setError(err.message)
    }
  }

  const fetchSubscriptionPlans = async () => {
    try {
      const response = await fetch(`${baseUrl}/superadmin/subscription-plans`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Failed to fetch subscription plans')
      const data = await response.json()
      setSubscriptionPlans(data)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = (client) => {
    setEditClientId(client.id)
    setEditForm({
      company: client.company || '',
      phone: client.phone || '',
      status: client.status || 'Active',
      plan: client.plan_name || 'Basic',
      logo: client.logo || null,
    })
    setEditLogoFile(null)
  }

  const handleSave = async (id) => {
    const formData = new FormData()
    formData.append('company', editForm.company)
    formData.append('phone', editForm.phone)
    formData.append('status', editForm.status)
    formData.append('plan', editForm.plan)
    if (editLogoFile) {
      formData.append('logo', editLogoFile)
    }

    try {
      const response = await fetch(`${baseUrl}/superadmin/clients/${id}`, {
        method: 'PUT',
        credentials: 'include',
        body: formData,
      })
      if (!response.ok) throw new Error('Failed to update client')
      const updatedClient = await response.json()
      setClients(
        clients.map((client) =>
          client.id === id
            ? { ...client, ...editForm, logo: updatedClient.logo }
            : client
        )
      )
      setEditClientId(null)
      setEditLogoFile(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleCancel = () => {
    setEditClientId(null)
    setEditForm({ company: '', phone: '', status: '', plan: '', logo: null })
    setEditLogoFile(null)
  }

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this client?')) {
      try {
        const response = await fetch(`${baseUrl}/superadmin/clients/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        if (!response.ok) throw new Error('Failed to delete client')
        setClients(clients.filter((client) => client.id !== id))
      } catch (err) {
        setError(err.message)
      }
    }
  }

  const handleAddClient = async (e) => {
    e.preventDefault()
    const formData = new FormData()
    formData.append('name', newClient.name)
    formData.append('email', newClient.email)
    formData.append('password', newClient.password)
    formData.append('company', newClient.company)
    formData.append('phone', newClient.phone)
    if (logoFile) {
      formData.append('logo', logoFile)
    }

    try {
      const response = await fetch(`${baseUrl}/superadmin/clients`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      if (!response.ok) {
        const errorData = await response.json()
        if (response.status === 401) {
          logout()
          navigate('/superadmin/login')
        } else {
          throw new Error(errorData.error || 'Failed to create client')
        }
      }
      const data = await response.json()
      setClients([
        ...clients,
        {
          id: data.id,
          ...newClient,
          status: 'Active',
          plan: 'Basic',
          logo: data.logo,
        },
      ])
      setNewClient({
        name: '',
        email: '',
        password: '',
        company: '',
        phone: '',
      })
      setLogoFile(null)
      setShowAddForm(false)
      fetchClients()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleLogoChange = (e) => {
    setLogoFile(e.target.files[0])
  }

  const handleEditLogoChange = (e) => {
    setEditLogoFile(e.target.files[0])
  }

  const filteredClients = clients.filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.company.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus =
      statusFilter === 'All' || client.status === statusFilter
    const matchesPlan = planFilter === 'All' || client.plan === planFilter
    return matchesSearch && matchesStatus && matchesPlan
  })

  // Sales Analytics
  const currentMonth = new Date().toISOString().slice(0, 7)
  const currentSales = salesData.find(
    (s) => s.month.slice(0, 7) === currentMonth
  )
  const prevSales = salesData
    .sort((a, b) => new Date(b.month) - new Date(a.month))
    .find((s) => s.month.slice(0, 7) < currentMonth)

  const calculateCurrentEarnings = () => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const daysInMonth = endOfMonth.getDate()

    const planPrices = subscriptionPlans.reduce((acc, plan) => {
      acc[plan.name] = plan.price || 0
      return acc
    }, {})

    let total = 0

    clients.forEach((client) => {
      if (client.status !== 'Active') return

      const subStart = new Date(client.subscription_start_date)
      const subEnd = new Date(client.subscription_end_date)

      const overlapStart = subStart > startOfMonth ? subStart : startOfMonth
      const overlapEnd = subEnd < endOfMonth ? subEnd : endOfMonth

      const daysUsed = Math.max(
        0,
        Math.floor((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1
      )

      if (daysUsed > 0 && planPrices[client.plan_name]) {
        const proratedEarning =
          (daysUsed / daysInMonth) * planPrices[client.plan_name]
        total += proratedEarning
      }
    })

    return Math.round(total)
  }

  const dynamicEarnings =
    currentMonth === new Date().toISOString().slice(0, 7)
      ? calculateCurrentEarnings()
      : currentSales?.earnings || 0
  const growthPercentage =
    prevSales && currentSales
      ? (
          ((dynamicEarnings - prevSales.earnings) / prevSales.earnings) *
          100
        ).toFixed(2)
      : 0

  const convertToINR = (amount) => Math.round(amount)

  const chartData = {
    labels: salesData.map((s) =>
      new Date(s.month).toLocaleString('default', {
        month: 'short',
        year: 'numeric',
      })
    ),
    datasets: [
      {
        label: 'Earnings (₹)',
        data: [
          ...salesData.map((s) => convertToINR(s.earnings || 0)),
          dynamicEarnings,
        ],
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      },
      {
        label: 'Expenses (₹)',
        data: [
          ...salesData.map((s) => convertToINR(s.expenses || 0)),
          convertToINR(currentSales?.expenses || 0),
        ],
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 14,
            family: "'Inter', 'system-ui', sans-serif",
            weight: '500',
          },
        },
      },
      title: {
        display: true,
        text: 'Monthly Earnings vs Expenses (₹)',
        font: {
          size: 18,
          family: "'Inter', 'system-ui', sans-serif",
          weight: '600',
        },
        padding: {
          top: 10,
          bottom: 30,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#F3F4F6',
        bodyColor: '#F3F4F6',
        borderColor: 'rgba(107, 114, 128, 0.2)',
        borderWidth: 1,
        cornerRadius: 12,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function (context) {
            return `${
              context.dataset.label
            }: ₹${context.parsed.y.toLocaleString('en-IN')}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 12,
            family: "'Inter', 'system-ui', sans-serif",
          },
          color: '#6B7280',
        },
      },
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Amount (₹)',
          font: {
            size: 13,
            family: "'Inter', 'system-ui', sans-serif",
            weight: '500',
          },
          color: '#6B7280',
        },
        grid: {
          color: 'rgba(107, 114, 128, 0.1)',
          lineWidth: 1,
        },
        ticks: {
          font: {
            size: 12,
            family: "'Inter', 'system-ui', sans-serif",
          },
          color: '#6B7280',
          callback: function (value) {
            return '₹' + value.toLocaleString('en-IN')
          },
        },
      },
    },
    elements: {
      bar: {
        borderWidth: 2,
      },
    },
    interaction: {
      intersect: false,
      mode: 'index',
    },
  }

  useEffect(() => {
    if (error) {
      toast.error(error, { duration: 5000 })
    }
  }, [error])

  useEffect(() => {})

  if (loading) return <ClockLoader />

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 flex flex-col font-sans">
      <Navbar />
      <div className="flex-grow py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <Shield className="w-12 h-12 text-white" />
              </div>
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-4">
              Superadmin Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-lg max-w-2xl mx-auto">
              Manage your clients, monitor sales performance, and oversee
              subscription plans all in one place
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl hover:scale-105 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {clients.length}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Total Clients
                  </div>
                </div>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-600 rounded-full w-full"></div>
              </div>
            </div>

            <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl hover:scale-105 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-gradient-to-r from-emerald-500 to-green-600 rounded-xl">
                  <Activity className="w-8 h-8 text-white" />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {clients.filter((c) => c.status === 'Active').length}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Active Clients
                  </div>
                </div>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-600 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      clients.length > 0
                        ? (clients.filter((c) => c.status === 'Active').length /
                            clients.length) *
                          100
                        : 0
                    }%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl hover:scale-105 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    ₹{dynamicEarnings.toLocaleString('en-IN')}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    July 2025 Earnings
                  </div>
                </div>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-500 to-orange-600 rounded-full w-full"></div>
              </div>
            </div>
          </div>

          <div className="space-y-12">
            {/* Client Management Section */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl mr-4">
                    <Users className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Client Management
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Manage and monitor your client base
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddForm(true)}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <Plus className="w-5 h-5 mr-2" /> Add Client
                </button>
              </div>

              {showAddForm && (
                <div className="mb-8 p-8 bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-700 dark:to-gray-600 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-inner">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                    Add New Client
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={newClient.name}
                      onChange={(e) =>
                        setNewClient({ ...newClient, name: e.target.value })
                      }
                      className="p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                      required
                    />
                    <input
                      type="email"
                      placeholder="Email Address"
                      value={newClient.email}
                      onChange={(e) =>
                        setNewClient({ ...newClient, email: e.target.value })
                      }
                      className="p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Company Name"
                      value={newClient.company}
                      onChange={(e) =>
                        setNewClient({ ...newClient, company: e.target.value })
                      }
                      className="p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Phone Number"
                      value={newClient.phone}
                      onChange={(e) =>
                        setNewClient({ ...newClient, phone: e.target.value })
                      }
                      className="p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                      required
                    />
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/gif"
                      onChange={handleLogoChange}
                      className="p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-100 dark:file:bg-indigo-900 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-200 dark:hover:file:bg-indigo-800 transition-all duration-200 backdrop-blur-sm"
                    />
                  </div>
                  <div className="mt-8 flex gap-4">
                    <button
                      type="button"
                      onClick={handleAddClient}
                      className="bg-gradient-to-r from-emerald-600 to-green-600 text-white px-6 py-3 rounded-xl hover:from-emerald-700 hover:to-green-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                      Create Client
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-6 py-3 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Search and Filters */}

              <div className="flex flex-col lg:flex-row gap-4 my-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search by name or company..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                  />
                </div>
                <div className="flex gap-4">
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="pl-10 pr-8 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm appearance-none cursor-pointer"
                    >
                      <option value="All">All Statuses</option>
                      <option value="Active">Active</option>
                      <option value="Trial">Trial</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <select
                      value={planFilter}
                      onChange={(e) => setPlanFilter(e.target.value)}
                      className="pl-10 pr-8 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm appearance-none cursor-pointer"
                    >
                      <option value="All">All Plans</option>
                      <option value="Basic">Basic</option>
                      <option value="Grand">Grand</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Client Table */}
              <div className="overflow-x-auto rounded-md">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Company
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Phone
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Plan
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Logo
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Last Activity
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/70 dark:bg-gray-800/70 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredClients.map((client) => (
                      <tr
                        key={client.id}
                        className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-all duration-150"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {client.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {editClientId === client.id ? (
                            <input
                              type="text"
                              value={editForm.company}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  company: e.target.value,
                                })
                              }
                              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                            />
                          ) : (
                            client.name
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {editClientId === client.id ? (
                            <input
                              type="text"
                              value={editForm.company}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  company: e.target.value,
                                })
                              }
                              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                            />
                          ) : (
                            client.company
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {client.email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {editClientId === client.id ? (
                            <input
                              type="text"
                              value={editForm.phone}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  phone: e.target.value,
                                })
                              }
                              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                            />
                          ) : (
                            client.phone || 'N/A'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {editClientId === client.id ? (
                            <select
                              value={editForm.status}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  status: e.target.value,
                                })
                              }
                              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                            >
                              <option value="Active">Active</option>
                              <option value="Trial">Trial</option>
                              <option value="Inactive">Inactive</option>
                            </select>
                          ) : (
                            client.status || 'Active'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {editClientId === client.id ? (
                            <select
                              value={editForm.plan}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  plan: e.target.value,
                                })
                              }
                              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none transition-all duration-200 backdrop-blur-sm"
                            >
                              <option value="Basic">Basic</option>
                              <option value="Grand">Grand</option>
                            </select>
                          ) : (
                            client.plan_name || 'Basic'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {editClientId === client.id ? (
                            <input
                              type="file"
                              accept="image/png, image/jpeg, image/gif"
                              onChange={handleEditLogoChange}
                              className="p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white/80 dark:bg-gray-600/80 text-gray-900 dark:text-gray-100 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-100 dark:file:bg-indigo-900 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-200 dark:hover:file:bg-indigo-800 transition-all duration-200 backdrop-blur-sm"
                            />
                          ) : client.logo ? (
                            <img
                              src={`https://storage.googleapis.com/gen-ai-quiz/uploads/${client.logo}`}
                              alt="Logo"
                              className="h-10 rounded-lg object-contain"
                            />
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {client.last_activity !== 'N/A'
                            ? new Date(client.last_activity).toLocaleString()
                            : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {editClientId === client.id ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSave(client.id)}
                                className="bg-gradient-to-r from-emerald-600 to-green-600 text-white px-4 py-2 rounded-xl hover:from-emerald-700 hover:to-green-700 transition-all duration-300 flex items-center shadow-lg hover:shadow-xl"
                              >
                                <Edit2 className="w-4 h-4 mr-2" /> Save
                              </button>
                              <button
                                onClick={handleCancel}
                                className="bg-gradient-to-r from-gray-500 to-gray-600 text-white px-4 py-2 rounded-xl hover:from-gray-600 hover:to-gray-700 transition-all duration-300 flex items-center shadow-lg hover:shadow-xl"
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(client)}
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 flex items-center shadow-lg hover:shadow-xl"
                              >
                                <Edit2 className="w-4 h-4 mr-2" /> Edit
                              </button>
                              <button
                                onClick={() => handleDelete(client.id)}
                                className="bg-gradient-to-r from-red-600 to-pink-600 text-white px-4 py-2 rounded-xl hover:from-red-700 hover:to-pink-700 transition-all duration-300 flex items-center shadow-lg hover:shadow-xl"
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Subscription Plans Section */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center">
                  <div className="p-3 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl mr-4">
                    <FileText className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Subscription Plans
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      View and manage client subscriptions
                    </p>
                  </div>
                </div>
                <Link
                  to="/subscriptions"
                  className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-xl flex items-center hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <Eye className="w-5 h-5 mr-2" /> View All Plans
                </Link>
              </div>
              <div className="overflow-x-auto rounded-md">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Company
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Plan
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white/70 dark:bg-gray-800/70 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredClients.map((client) => (
                      <tr
                        key={client.id}
                        className="hover:bg-gray-50/50 dark:hover:bg-gray-700/50 transition-all duration-150"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          <Link
                            to={`/subscription-details/${client.id}`}
                            className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-all duration-200"
                          >
                            {client.name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {client.company}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {client.plan_name || 'None'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          <Link
                            to={`/subscription-details/${client.id}`}
                            className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 flex items-center shadow-lg hover:shadow-xl w-fit"
                          >
                            <Eye className="w-4 h-4 mr-2" /> View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sales Analytics Section */}
            <div className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8 hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center">
                  <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl mr-4">
                    <BarChart2 className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                      Sales Analytics
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      Track earnings and expenses over time
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-700 dark:to-gray-600 p-6 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-inner">
                  <div className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">
                    <TrendingUp className="w-5 h-5 mr-2 text-emerald-500" />{' '}
                    Current Month (July 2025)
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      Earnings: ₹{dynamicEarnings.toLocaleString('en-IN')}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      Expenses: ₹
                      {convertToINR(currentSales?.expenses || 0).toLocaleString(
                        'en-IN'
                      )}
                    </p>
                    <p className="text-md text-gray-600 dark:text-gray-400">
                      Income vs Expenses: ₹
                      {(
                        dynamicEarnings - (currentSales?.expenses || 0)
                      ).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-700 dark:to-gray-600 p-6 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-inner">
                  <div className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">
                    <Activity className="w-5 h-5 mr-2 text-amber-500" />{' '}
                    Growth/Fall
                  </div>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {growthPercentage}%{' '}
                    {growthPercentage > 0
                      ? 'Growth'
                      : growthPercentage < 0
                      ? 'Fall'
                      : 'Stable'}{' '}
                    (vs June 2025)
                  </p>
                </div>
              </div>
              <div className="h-[400px]">
                <Bar data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard
