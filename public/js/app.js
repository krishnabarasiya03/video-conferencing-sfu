// Main application JavaScript for landing page

function hostMeeting() {
    window.location.href = '/host.html';
}

function joinMeeting() {
    const meetingCode = document.getElementById('meetingCodeInput').value.trim();
    
    if (!meetingCode) {
        alert('Please enter a meeting code');
        return;
    }
    
    if (meetingCode.length !== 6 || !/^\d+$/.test(meetingCode)) {
        alert('Please enter a valid 6-digit meeting code');
        return;
    }
    
    // Store the meeting code in sessionStorage and redirect to participant page
    sessionStorage.setItem('meetingCode', meetingCode);
    window.location.href = '/participant.html';
}

// Allow Enter key to join meeting
document.addEventListener('DOMContentLoaded', function() {
    const meetingCodeInput = document.getElementById('meetingCodeInput');
    if (meetingCodeInput) {
        meetingCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                joinMeeting();
            }
        });
        
        // Auto-format meeting code (add spaces every 3 digits)
        meetingCodeInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
            if (value.length > 6) {
                value = value.substring(0, 6);
            }
            e.target.value = value;
        });
    }
});