// Function to encode credentials to base64
const encodeCredentials = (identifier, password) => {
    // If identifier is an email, use it directly, otherwise use as username
    return btoa(`${identifier}:${password}`);
};

// Function to store JWT token
const storeToken = (token) => {
    if (!token) {
        throw new Error('Invalid token');
    }
    try {
        localStorage.setItem('jwt_token', token);
        // Verify token was stored
        const storedToken = localStorage.getItem('jwt_token');
        if (storedToken !== token) {
            throw new Error('Token storage verification failed');
        }
    } catch (error) {
        console.error('Failed to store token:', error);
        throw new Error('Failed to store authentication token');
    }
};

// Function to get stored JWT token
const getToken = () => {
    return localStorage.getItem('jwt_token');
};

// Function to remove JWT token (logout)
const removeToken = () => {
    try {
        localStorage.removeItem('jwt_token');
        // Verify token was removed
        if (localStorage.getItem('jwt_token')) {
            throw new Error('Token removal verification failed');
        }
    } catch (error) {
        console.error('Failed to remove token:', error);
        throw new Error('Failed to complete logout');
    }
};

// Function to check if user is authenticated
const isAuthenticated = () => {
    return !!getToken();
};

// Function to handle login
const login = async (identifier, password) => {
    try {
        // Validate identifier (username or email)
        if (!identifier || !password) {
            throw new Error('Username/Email and password are required');
        }

        const response = await fetch('https://learn.reboot01.com/api/auth/signin', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${encodeCredentials(identifier, password)}`
            }
        });

        if (!response.ok) {
            throw new Error('Invalid credentials');
        }

        const token = await response.json();
        storeToken(token);
        return true;
    } catch (error) {
        throw error;
    }
};

// Function to logout
const logout = () => {
    removeToken();
    window.location.href = './index.html';
};

// Export functions
export {
    login,
    logout,
    isAuthenticated,
    getToken
};
