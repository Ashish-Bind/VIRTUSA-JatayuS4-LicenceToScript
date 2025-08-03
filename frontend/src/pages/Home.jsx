import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Zap,
  BarChart2,
  Shield,
  FileText,
  Clock,
  Smartphone,
  Github,
  Twitter,
  Linkedin,
  Facebook,
  Mail,
  ChevronRight,
  ArrowRight,
  Star,
  DollarSign,
  CheckCircle,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import LinkButton from '../components/LinkButton'
import { motion, useInView } from 'framer-motion'
import { Typewriter } from 'react-simple-typewriter'

const Home = () => {
  const featuresRef = useRef(null)
  const howItWorksRef = useRef(null)
  const testimonialsRef = useRef(null)
  const pricingRef = useRef(null)

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  const scrollToTestimonials = () => {
    testimonialsRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  const scrollToPricing = () => {
    pricingRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const featuresInView = useInView(featuresRef, { once: true, amount: 0.3 })
  const howItWorksInView = useInView(howItWorksRef, { once: true, amount: 0.3 })
  const testimonialsInView = useInView(testimonialsRef, {
    once: true,
    amount: 0.3,
  })
  const pricingInView = useInView(pricingRef, { once: true, amount: 0.3 })

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  }

  const buttonVariants = {
    hover: { scale: 1.05, transition: { duration: 0.3 } },
  }

  const testimonials = [
    {
      id: 1,
      name: 'Sarah Johnson',
      role: 'HR Director, TechCorp',
      content:
        'AI Quiz has revolutionized our hiring process. The adaptive testing saves us 40% of screening time while improving candidate quality.',
      avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
      rating: 5,
    },
    {
      id: 2,
      name: 'Michael Chen',
      role: 'Professor, State University',
      content:
        'The skill gap analysis is incredibly accurate. My students get personalized feedback that helps them focus their studies effectively.',
      avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
      rating: 5,
    },
    {
      id: 3,
      name: 'David Wilson',
      role: 'Candidate, Software Engineer',
      content:
        'Finally an assessment that adapts to my skill level! The questions were challenging but fair, and the feedback was actually useful.',
      avatar: 'https://randomuser.me/api/portraits/men/67.jpg',
      rating: 4,
    },
  ]

  const features = [
    {
      title: 'Adaptive MCQs',
      description:
        'AI-generated questions that adapt to candidate skill level in real-time.',
      icon: <Zap className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />,
    },
    {
      title: 'Skill Gap Analysis',
      description:
        'Comprehensive reports showing strengths and areas for improvement.',
      icon: (
        <BarChart2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
      ),
    },
    {
      title: 'Secure Proctoring',
      description: 'AI-powered cheating detection with facial recognition.',
      icon: <Shield className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />,
    },
    {
      title: 'Detailed Reports',
      description: 'Actionable insights with visual data representations.',
      icon: (
        <FileText className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
      ),
    },
    {
      title: 'Time Efficient',
      description: '50% faster assessments with same accuracy.',
      icon: <Clock className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />,
    },
    {
      title: 'Mobile Friendly',
      description: 'Fully responsive design works on any device.',
      icon: (
        <Smartphone className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
      ),
    },
  ]

  const steps = [
    {
      number: 1,
      title: 'Submit Profile',
      description: 'Candidate uploads resume or profile',
    },
    {
      number: 2,
      title: 'Skill Analysis',
      description: 'AI identifies skill gaps and strengths',
    },
    {
      number: 3,
      title: 'Adaptive Quiz',
      description: 'Personalized questions based on skill level',
    },
    {
      number: 4,
      title: 'Get Results',
      description: 'Detailed report with actionable insights',
    },
  ]

  const pricingPlans = [
    {
      name: 'Free',
      price: 0,
      description: 'Perfect for individuals or small teams getting started.',
      features: ['5 assessments/month', 'Basic reports', 'Community support'],
      buttonText: 'Get Started',
      buttonLink: '/candidate/signup',
      isPopular: false,
    },
    {
      name: 'Basic',
      price: 999,
      description: 'Ideal for small businesses or educators.',
      features: ['50 assessments/month', 'Basic AI reports', 'Email support'],
      buttonText: 'Subscribe',
      buttonLink: '/recruiter/subscriptions',
      isPopular: false,
    },
    {
      name: 'Pro',
      price: 4999,
      description: 'Best for growing teams needing advanced features.',
      features: [
        'Unlimited assessments',
        'Advanced AI reports',
        'Proctoring',
        'Priority support',
      ],
      buttonText: 'Subscribe',
      buttonLink: '/recruiter/subscriptions',
      isPopular: true,
    },
    {
      name: 'Enterprise',
      price: null,
      description: 'Custom solutions for large organizations.',
      features: [
        'Unlimited assessments',
        'Custom AI reports',
        'Dedicated manager',
        'API access',
      ],
      buttonText: 'Contact Sales',
      buttonLink: '/contact',
      isPopular: false,
    },
  ]

  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-slate-900 dark:to-indigo-950 font-sans">
      <Navbar
        scrollToFeatures={scrollToFeatures}
        scrollToHowItWorks={scrollToHowItWorks}
        scrollToTestimonials={scrollToTestimonials}
        scrollToPricing={scrollToPricing}
      />

      {/* Hero Section */}
      <motion.div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-24 text-center"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <motion.div className="flex items-center justify-center mb-6">
          <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
            <Zap className="w-12 h-12 text-white" />
          </div>
        </motion.div>
        <motion.h1
          className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          Intelligent MCQ Assessments <br /> & Analytics Platform
        </motion.h1>
        <motion.p
          className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Revolutionizing recruitment and education with{' '}
          <span className="font-semibold">
            <Typewriter
              words={[
                'AI-powered adaptive testing',
                'Skill Gap Analysis',
                'Secure Proctoring',
                'Detailed Reports',
                'Time Efficient Assessments',
              ]}
              loop={0}
              cursor
              cursorStyle="|"
              typeSpeed={70}
              deleteSpeed={50}
              delaySpeed={1000}
            />
          </span>
        </motion.p>
        <motion.div
          className="mt-12 flex flex-col sm:flex-row justify-center gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {user ? (
            <motion.div variants={itemVariants}>
              <LinkButton
                to="/candidate/dashboard"
                className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                variants={buttonVariants}
                whilehover="hover"
              >
                Go to Dashboard <ArrowRight className="w-5 h-5" />
              </LinkButton>
            </motion.div>
          ) : (
            <>
              <motion.div variants={itemVariants}>
                <LinkButton
                  to="/candidate/signup"
                  className="bg-gradient-to-r border-2 border-transparent from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 shadow-lg hover:shadow-xl"
                  variants={buttonVariants}
                  whilehover="hover"
                >
                  Get Started as Candidate <ArrowRight className="w-5 h-5" />
                </LinkButton>
              </motion.div>
              <motion.div variants={itemVariants}>
                <LinkButton
                  to="/recruiter/login"
                  className="border-2 border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 transition-all duration-300"
                  variants={buttonVariants}
                  whilehover="hover"
                >
                  Recruiter Login <ChevronRight className="w-5 h-5" />
                </LinkButton>
              </motion.div>
            </>
          )}
        </motion.div>
      </motion.div>

      {/* Features Section */}
      <div id="features" className="py-16" ref={featuresRef}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0 }}
            animate={featuresInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <Star className="w-12 h-12 text-white" />
              </div>
            </div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent">
              Powerful Features
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Everything you need to transform your assessment process
            </p>
          </motion.div>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            variants={containerVariants}
            initial="hidden"
            animate={featuresInView ? 'visible' : 'hidden'}
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="group bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300"
                variants={itemVariants}
                whilehover={{ scale: 1.05 }}
              >
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* How It Works Section */}
      <div id="how-it-works" className="py-16" ref={howItWorksRef}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0 }}
            animate={howItWorksInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <FileText className="w-12 h-12 text-white" />
              </div>
            </div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Simple steps to better assessments
            </p>
          </motion.div>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-4 gap-8"
            variants={containerVariants}
            initial="hidden"
            animate={howItWorksInView ? 'visible' : 'hidden'}
          >
            {steps.map((step) => (
              <motion.div
                key={step.number}
                className="text-center bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300"
                variants={itemVariants}
                whilehover={{ scale: 1.05 }}
              >
                <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-xl">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Pricing Section */}
      <div id="pricing" className="py-16" ref={pricingRef}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0 }}
            animate={pricingInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <DollarSign className="w-12 h-12 text-white" />
              </div>
            </div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent">
              Pricing Plans
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Choose a plan that fits your needs and start transforming your
              assessments
            </p>
          </motion.div>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
            variants={containerVariants}
            initial="hidden"
            animate={pricingInView ? 'visible' : 'hidden'}
          >
            {pricingPlans.map((plan) => (
              <motion.div
                key={plan.name}
                className={`group flex flex-col justify-between bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300 relative ${
                  plan.isPopular
                    ? 'ring-2 ring-indigo-500 dark:ring-indigo-400'
                    : ''
                }`}
                variants={itemVariants}
                whilehover={{ scale: 1.05 }}
              >
                {plan.isPopular && (
                  <span className="absolute top-0 right-0 bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-bl-lg rounded-tr-lg">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {plan.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {plan.description}
                </p>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                  {plan.price === null
                    ? 'Custom'
                    : `₹${plan.price.toLocaleString('en-IN')}`}
                  {plan.price !== null && (
                    <span className="text-sm font-normal">/month</span>
                  )}
                </div>
                <ul className="text-gray-600 dark:text-gray-400 mb-6 space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <LinkButton
                  to={plan.buttonLink}
                  className={`w-full bg-gradient-to-r ${
                    plan.name === 'Enterprise'
                      ? 'from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'
                      : 'from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                  } text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 shadow-lg hover:shadow-xl`}
                  variants={buttonVariants}
                  whilehover="hover"
                >
                  {plan.buttonText} <ArrowRight className="w-5 h-5" />
                </LinkButton>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Testimonials Section */}
      <div id="testimonials" className="py-16" ref={testimonialsRef}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0 }}
            animate={testimonialsInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                <Star className="w-12 h-12 text-white" />
              </div>
            </div>
            <h2 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-800 bg-clip-text text-transparent">
              What Our Users Say
            </h2>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Don't just take our word for it
            </p>
          </motion.div>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            variants={containerVariants}
            initial="hidden"
            animate={testimonialsInView ? 'visible' : 'hidden'}
          >
            {testimonials.map((testimonial) => (
              <motion.div
                key={testimonial.id}
                className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300"
                variants={itemVariants}
                whilehover={{ scale: 1.05 }}
              >
                <div className="flex items-center mb-4">
                  <img
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    className="w-12 h-12 rounded-full mr-4 border-2 border-indigo-600 dark:border-indigo-400"
                  />
                  <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {testimonial.name}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {testimonial.role}
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400 italic">
                  "{testimonial.content}"
                </p>
                <div className="mt-4 flex">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-5 h-5 fill-yellow-400 text-yellow-400"
                    />
                  ))}
                  {[...Array(5 - testimonial.rating)].map((_, i) => (
                    <Star
                      key={i + testimonial.rating}
                      className="w-5 h-5 text-gray-300 dark:text-gray-600"
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* CTA Section */}
      <motion.div
        className="py-16 bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div className="flex items-center justify-center mb-6">
            <div className="p-4 bg-white rounded-2xl shadow-lg">
              <ArrowRight className="w-12 h-12 text-indigo-600" />
            </div>
          </motion.div>
          <motion.h2
            className="text-4xl font-bold mb-6"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            Ready to Transform Your Assessments?
          </motion.h2>
          <motion.p
            className="text-xl mb-8 max-w-3xl mx-auto"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            Join thousands of organizations using AI Quiz to make better hiring
            and education decisions.
          </motion.p>
          <motion.div
            className="flex flex-col sm:flex-row justify-center gap-4"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={itemVariants}>
              <Link
                to="mailto:zaenko@gmail.com?subject=Signup%20for%20AI%20Quiz&body=Hello%20Admin%2C%0AI%20need%20help%20with..."
                className="bg-white text-indigo-600 px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-all duration-300 shadow-lg hover:shadow-xl"
                variants={buttonVariants}
                whilehover="hover"
              >
                Contact Admin
                <ChevronRight className="w-5 h-5" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.footer
        className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-lg border-t border-gray-200/50 dark:border-gray-700/50"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={itemVariants}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-wider uppercase mb-4">
                Product
              </h3>
              <ul className="space-y-3">
                <li>
                  <a
                    href="#features"
                    className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                    onClick={scrollToFeatures}
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#how-it-works"
                    className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                    onClick={scrollToHowItWorks}
                  >
                    How It Works
                  </a>
                </li>
                <li>
                  <a
                    href="#pricing"
                    className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                    onClick={scrollToPricing}
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <a
                    href="#testimonials"
                    className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                    onClick={scrollToTestimonials}
                  >
                    Testimonials
                  </a>
                </li>
              </ul>
            </motion.div>
            <motion.div variants={itemVariants}>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-wider uppercase mb-4">
                Connect
              </h3>
              <ul className="space-y-3">
                <li>
                  <a
                    href="https://github.com"
                    className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
                  >
                    <Github className="w-5 h-5" /> GitHub
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:support@aiquiz.com"
                    className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-2"
                  >
                    <Mail className="w-5 h-5" /> Contact
                  </a>
                </li>
              </ul>
            </motion.div>
          </motion.div>
          <motion.div
            className="mt-12 pt-8 border-t border-gray-200/50 dark:border-gray-700/50 flex flex-col md:flex-row justify-between items-center"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.p
              className="text-gray-600 dark:text-gray-400 text-sm"
              variants={itemVariants}
            >
              © {new Date().getFullYear()} AI Quiz. All rights reserved.
            </motion.p>
            <motion.div
              className="mt-4 md:mt-0 flex space-x-6"
              variants={containerVariants}
            >
              {[
                { icon: Github, href: 'https://github.com', label: 'GitHub' },
                {
                  icon: Twitter,
                  href: 'https://twitter.com',
                  label: 'Twitter',
                },
                {
                  icon: Linkedin,
                  href: 'https://linkedin.com',
                  label: 'LinkedIn',
                },
                {
                  icon: Facebook,
                  href: 'https://facebook.com',
                  label: 'Facebook',
                },
              ].map(({ icon: Icon, href, label }) => (
                <motion.a
                  key={label}
                  href={href}
                  className="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                  variants={itemVariants}
                  whilehover={{ scale: 1.2 }}
                >
                  <span className="sr-only">{label}</span>
                  <Icon className="h-6 w-6" />
                </motion.a>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </motion.footer>
    </div>
  )
}

export default Home
