document.addEventListener('DOMContentLoaded', () => {
    const button = document.querySelector('button');
    const amountInput = document.getElementById('amount');
    const resultMessage = document.getElementById('result-message');

    // Get customerID from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const customerID = urlParams.get('customerID');

    button.addEventListener('click', async () => {
        try {
            const amount = amountInput.value;
            
            // Show processing message
            resultMessage.textContent = 'Processing...';
            
            // Make API request
            const response = await fetch(`/api/upsale/${customerID}/${amount}`, {
                method: 'GET'
            });
            
            const result = await response.json();
            
            // Display result
            resultMessage.textContent = JSON.stringify(result);
        } catch (error) {
            resultMessage.textContent = `Error: ${error.message}`;
        }
    });
});
