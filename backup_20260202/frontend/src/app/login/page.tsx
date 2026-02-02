'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login, setAuthData } from '@/lib/api';

// Pre-defined particle positions to avoid hydration mismatch
const PARTICLES = [
    { left: 10, top: 20, delay: 0, duration: 8 },
    { left: 25, top: 45, delay: 1.2, duration: 10 },
    { left: 40, top: 15, delay: 2.5, duration: 7 },
    { left: 55, top: 70, delay: 0.8, duration: 12 },
    { left: 70, top: 35, delay: 3, duration: 9 },
    { left: 85, top: 60, delay: 1.5, duration: 11 },
    { left: 15, top: 80, delay: 4, duration: 8 },
    { left: 30, top: 55, delay: 2, duration: 10 },
    { left: 45, top: 30, delay: 0.5, duration: 9 },
    { left: 60, top: 85, delay: 3.5, duration: 12 },
    { left: 75, top: 10, delay: 1, duration: 7 },
    { left: 90, top: 40, delay: 2.8, duration: 11 },
    { left: 5, top: 65, delay: 4.5, duration: 8 },
    { left: 35, top: 90, delay: 0.3, duration: 10 },
    { left: 50, top: 25, delay: 1.8, duration: 9 },
    { left: 65, top: 50, delay: 3.2, duration: 11 },
    { left: 80, top: 75, delay: 0.7, duration: 8 },
    { left: 95, top: 15, delay: 2.2, duration: 10 },
    { left: 20, top: 95, delay: 4.2, duration: 12 },
    { left: 48, top: 5, delay: 1.5, duration: 9 },
];

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Ensure client-side only rendering for particles
    useEffect(() => {
        setMounted(true);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            console.log('🔐 Attempting login for:', email);
            const result = await login(email, password);

            if (result.success && result.user) {
                console.log('✅ Login successful:', result.user.email);
                // Redirect to home page on successful login
                router.push('/home');
            } else {
                console.log('❌ Login failed:', result.error);
                setError(result.error || 'Invalid credentials');
            }
        } catch (err) {
            console.error('Login error:', err);
            setError('Unable to connect to server. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4">
            {/* Animated Background Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-20 -right-20 sm:-top-40 sm:-right-40 w-48 h-48 sm:w-64 md:w-80 sm:h-64 md:h-80 bg-indigo-500/20 rounded-full blur-3xl animate-pulse" />
                <div className="absolute -bottom-20 -left-20 sm:-bottom-40 sm:-left-40 w-48 h-48 sm:w-64 md:w-80 sm:h-64 md:h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 sm:w-72 md:w-96 sm:h-72 md:h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            {/* Floating Particles - Only render after mount to avoid hydration issues */}
            {mounted && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {PARTICLES.map((particle, i) => (
                        <div
                            key={i}
                            className="absolute w-1 h-1 bg-indigo-400/30 rounded-full animate-float"
                            style={{
                                left: `${particle.left}%`,
                                top: `${particle.top}%`,
                                animationDelay: `${particle.delay}s`,
                                animationDuration: `${particle.duration}s`,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Login Card */}
            <div className="relative z-10 w-full max-w-md px-0 sm:px-4">
                <div className="glass-panel rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl animate-pulse-glow">
                    {/* Logo/Header */}
                    <div className="text-center mb-6 sm:mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-3 sm:mb-4 shadow-lg shadow-indigo-500/20">
                            <svg className="w-8 h-8 sm:w-10 sm:h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                            Prompt Viewer
                        </h1>
                        <p className="text-gray-400 mt-1.5 sm:mt-2 text-xs sm:text-sm">
                            HR Assist Metadata Dashboard
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg sm:rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs sm:text-sm flex items-center gap-2 sm:gap-3 animate-shake">
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="break-words">{error}</span>
                        </div>
                    )}

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                        {/* Email Field */}
                        <div className="relative group">
                            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5 sm:mb-2 ml-1">
                                Email Address
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                    </svg>
                                </div>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-3.5 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-300"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="relative group">
                            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5 sm:mb-2 ml-1">
                                Password
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-3 sm:py-3.5 bg-white/5 border border-white/10 rounded-lg sm:rounded-xl text-sm sm:text-base text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-300"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 sm:pr-4 flex items-center text-gray-500 hover:text-indigo-400 transition-colors"
                                >
                                    {showPassword ? (
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Remember Me & Forgot Password */}
                        <div className="flex items-center justify-between text-xs sm:text-sm">
                            <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/30 focus:ring-offset-0 cursor-pointer"
                                />
                                <span className="text-gray-400 group-hover:text-gray-300 transition-colors">
                                    Remember me
                                </span>
                            </label>
                            <a href="#" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                                Forgot password?
                            </a>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 sm:py-4 px-6 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-size-200 bg-pos-0 hover:bg-pos-100 text-white font-semibold text-sm sm:text-base rounded-lg sm:rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
                        >
                            <span className={`flex items-center justify-center gap-2 transition-all duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
                                Sign In
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                </svg>
                            </span>
                            {isLoading && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                </div>
                            )}
                        </button>
                    </form>

                    {/* Sign Up Link */}
                    <p className="text-center text-gray-400 text-xs sm:text-sm mt-6 sm:mt-8">
                        Don&apos;t have an account?{' '}
                        <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                            Create one
                        </Link>
                    </p>
                </div>

                {/* Footer Text */}
                <p className="text-center text-gray-600 text-[10px] sm:text-xs mt-4 sm:mt-6">
                    © 2026 HR Assist. All rights reserved.
                </p>
            </div>

            {/* Custom Styles */}
            <style jsx global>{`
                @keyframes float {
                    0%, 100% {
                        transform: translateY(0) translateX(0);
                        opacity: 0.3;
                    }
                    50% {
                        transform: translateY(-20px) translateX(10px);
                        opacity: 0.8;
                    }
                }
                
                .animate-float {
                    animation: float ease-in-out infinite;
                }
                
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                
                .animate-shake {
                    animation: shake 0.5s ease-in-out;
                }
                
                .bg-size-200 {
                    background-size: 200% 100%;
                }
                
                .bg-pos-0 {
                    background-position: 0% 0%;
                }
                
                .bg-pos-100 {
                    background-position: 100% 0%;
                }
            `}</style>
        </div>
    );
}
