import '@testing-library/jest-dom';

// Silence logger output during tests (set to 'error' to see only errors, or 'none' to mute all)
localStorage.setItem('logLevel', 'none');

// Skip onboarding tour in tests
localStorage.setItem('onboardingTourCompleted', 'true');