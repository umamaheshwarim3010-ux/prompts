/**
 * API Utility for handling HTTP requests with JWT authentication
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

// Token storage keys
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

/**
 * Get stored access token
 */
export const getAccessToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACCESS_TOKEN_KEY);
};

/**
 * Get stored refresh token
 */
export const getRefreshToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_TOKEN_KEY);
};

/**
 * Get stored user data
 */
export const getStoredUser = (): any | null => {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem(USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
};

/**
 * Store authentication data
 */
export const setAuthData = (accessToken: string, refreshToken: string, user: any): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
};

/**
 * Clear authentication data
 */
export const clearAuthData = (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
    return !!getAccessToken();
};

/**
 * Refresh the access token using refresh token
 */
export const refreshAccessToken = async (): Promise<string | null> => {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
        return null;
    }

    try {
        const response = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken })
        });

        const data = await response.json();

        if (data.success && data.accessToken) {
            localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
            return data.accessToken;
        }

        return null;
    } catch (error) {
        console.error('Token refresh failed:', error);
        return null;
    }
};

/**
 * API request options interface
 */
interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: any;
    headers?: Record<string, string>;
    requiresAuth?: boolean;
}

/**
 * Make an authenticated API request
 */
export const apiRequest = async <T = any>(
    endpoint: string,
    options: RequestOptions = {}
): Promise<{ success: boolean; data?: T; error?: string; status?: number }> => {
    const {
        method = 'GET',
        body,
        headers = {},
        requiresAuth = true
    } = options;

    try {
        // Build headers
        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...headers
        };

        // Add authorization header if required
        if (requiresAuth) {
            const token = getAccessToken();
            if (token) {
                requestHeaders['Authorization'] = `Bearer ${token}`;
            }
        }

        // Build request config
        const config: RequestInit = {
            method,
            headers: requestHeaders,
            credentials: 'include'
        };

        // Add body for non-GET requests
        if (body && method !== 'GET') {
            config.body = JSON.stringify(body);
        }

        // Make request
        let response = await fetch(`${API_URL}${endpoint}`, config);

        // Handle 401 - try to refresh token
        if (response.status === 401 && requiresAuth) {
            const newToken = await refreshAccessToken();

            if (newToken) {
                // Retry with new token
                requestHeaders['Authorization'] = `Bearer ${newToken}`;
                config.headers = requestHeaders;
                response = await fetch(`${API_URL}${endpoint}`, config);
            } else {
                // Refresh failed - clear auth data
                clearAuthData();
                return {
                    success: false,
                    error: 'Session expired. Please login again.',
                    status: 401
                };
            }
        }

        // Parse response
        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: data.message || 'Request failed',
                status: response.status
            };
        }

        return {
            success: true,
            data,
            status: response.status
        };

    } catch (error) {
        console.error('API request failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Network error'
        };
    }
};

/**
 * Login user
 */
export const login = async (email: string, password: string): Promise<{
    success: boolean;
    user?: any;
    error?: string;
}> => {
    try {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            // Store tokens and user data
            setAuthData(
                data.accessToken || data.token,
                data.refreshToken || data.token,
                data.user
            );
            return { success: true, user: data.user };
        }

        return { success: false, error: data.message };

    } catch (error) {
        console.error('Login failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Login failed'
        };
    }
};

/**
 * Register new user
 */
export const register = async (email: string, password: string, name: string): Promise<{
    success: boolean;
    user?: any;
    error?: string;
}> => {
    try {
        const response = await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password, name })
        });

        const data = await response.json();

        if (data.success) {
            // Store tokens and user data
            setAuthData(
                data.accessToken || data.token,
                data.refreshToken || data.token,
                data.user
            );
            return { success: true, user: data.user };
        }

        return { success: false, error: data.message };

    } catch (error) {
        console.error('Registration failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Registration failed'
        };
    }
};

/**
 * Logout user
 */
export const logout = async (): Promise<void> => {
    try {
        await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        // Ignore errors during logout
    } finally {
        clearAuthData();
    }
};

/**
 * Verify current token
 */
export const verifyToken = async (): Promise<{
    valid: boolean;
    user?: any;
}> => {
    const token = getAccessToken();

    if (!token) {
        return { valid: false };
    }

    try {
        const response = await fetch(`${API_URL}/api/auth/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ token })
        });

        const data = await response.json();

        if (data.success && data.user) {
            return { valid: true, user: data.user };
        }

        return { valid: false };

    } catch (error) {
        return { valid: false };
    }
};

/**
 * Get current user info
 */
export const getCurrentUser = async (): Promise<any | null> => {
    const result = await apiRequest('/api/auth/me');
    return result.success ? result.data?.user : null;
};

export default {
    getAccessToken,
    getRefreshToken,
    getStoredUser,
    setAuthData,
    clearAuthData,
    isAuthenticated,
    refreshAccessToken,
    apiRequest,
    login,
    register,
    logout,
    verifyToken,
    getCurrentUser
};
