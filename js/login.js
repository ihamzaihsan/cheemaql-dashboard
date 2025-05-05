import { login, isAuthenticated } from './auth.js';

// Redirect if already authenticated
if (isAuthenticated()) {
    window.location.href = '../profile.html';
}

// Get form elements
const form = document.querySelector('.form-container');
const identifierEl = document.querySelector('.form-container .form-row input[name="username"]'); // Using existing username input
const passwordEl = document.querySelector('.form-container .form-row input[name="password"]');
const submitBtn = document.querySelector('.form-container .form-row input[type="submit"]');
const checkboxEl = document.querySelector('.form-container .form-row input[type="checkbox"]');
checkboxEl.disabled = true;

// Create error message element
const errorMessage = document.createElement('div');
errorMessage.style.color = 'red';
errorMessage.style.marginTop = '10px';
form.appendChild(errorMessage);

// Update placeholder to indicate both username and email are accepted
identifierEl.placeholder = 'username or email';

// Validate inputs
const validateInputs = () => {
    // Validate identifier (username or email)
    if (identifierEl.value.length > 0) {
        identifierEl.classList.add('valid');
    } else {
        identifierEl.classList.remove('valid');
    }

    // Validate password (minimum 1 character)
    if (passwordEl.value.length > 0) {
        passwordEl.classList.add('valid');
    } else {
        passwordEl.classList.remove('valid');
    }
};

// Add input listeners
identifierEl.addEventListener('input', validateInputs);
passwordEl.addEventListener('input', () => {
    passwordValid = passwordEl.value.length > 0;
    
    // Enable/disable checkbox based on password input
    checkboxEl.disabled = !passwordValid;
    
    // Uncheck when password is cleared
    if (!passwordValid) {
        checkboxEl.checked = false;
        createPullingTimeline(state.handClosed, false); // Reset animations
    }

    if (passwordValid) {
        passwordTl.play();
        passwordEl.classList.add("valid");
    } else {
        passwordTl.reverse();
        passwordEl.classList.remove("valid");
    }
});

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Check password before checkbox
    if (!passwordValid) {
        errorMessage.textContent = 'Please enter a password first';
        return;
    }

     // Check if checkbox is checked first
     if (!checkboxEl.checked) {
        errorMessage.textContent = 'Please agree to the terms first';
        return;
    }
    
    // Validate inputs before submission
    validateInputs();
    
    if (!identifierEl.value || !passwordEl.value) {
        errorMessage.textContent = 'Please fill in all fields';
        return;
    }
    
    try {
        submitBtn.disabled = true;
        errorMessage.textContent = ''; // Clear any previous error
        await login(identifierEl.value, passwordEl.value);
        window.location.href = '../profile.html';
    } catch (error) {
        errorMessage.textContent = error.message;
        // Reset animations
        identifierEl.classList.remove('valid');
        passwordEl.classList.remove('valid');
        submitBtn.disabled = false;
    }
});
