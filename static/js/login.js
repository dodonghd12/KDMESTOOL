document.addEventListener('DOMContentLoaded', function() {
    const terminalInput = document.getElementById('terminal-input');
    const output = document.getElementById('output');

    // Focus vào input khi click vào terminal
    document.querySelector('.terminal').addEventListener('click', () => {
        terminalInput.focus();
    });

    // Xử lý khi nhấn Enter
    terminalInput.addEventListener('keypress', async function(e) {
        if (e.key === 'Enter') {
            const inputValue = terminalInput.value.trim();
            
            // Hiển thị command đã nhập
            const commandLine = document.createElement('p');
            commandLine.className = 'text-gray-300';
            commandLine.innerHTML = `<span class="text-green-500">➝</span> <span class="text-sky-300">~</span> ${inputValue}`;
            output.appendChild(commandLine);
            
            // Clear input
            terminalInput.value = '';
            
            // Xử lý command
            if (inputValue === '1') {
                // Hiển thị message đang xác thực
                const authMessage = document.createElement('p');
                authMessage.className = 'text-yellow-400 mt-2';
                authMessage.textContent = 'Authenticating...';
                output.appendChild(authMessage);
                
                // Scroll xuống cuối
                output.scrollTop = output.scrollHeight;
                
                try {
                    const response = await fetch('/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            user_id: 'thsang',
                            password: 'thsang'
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        // Hiển thị thành công
                        const successMessage = document.createElement('p');
                        successMessage.className = 'text-green-400';
                        successMessage.textContent = '✓ Authentication successful!';
                        output.appendChild(successMessage);
                        
                        const redirectMessage = document.createElement('p');
                        redirectMessage.className = 'text-sky-300';
                        redirectMessage.textContent = 'Redirecting...';
                        output.appendChild(redirectMessage);
                        
                        // Scroll xuống cuối
                        output.scrollTop = output.scrollHeight;
                        
                        // Chuyển hướng sau 1 giây
                        setTimeout(() => {
                            window.location.href = '/main';
                        }, 1000);
                    } else {
                        // Hiển thị lỗi
                        const errorMessage = document.createElement('p');
                        errorMessage.className = 'text-red-400';
                        errorMessage.textContent = `✗ ${result.message || 'Authentication failed'}`;
                        output.appendChild(errorMessage);
                        
                        // Scroll xuống cuối
                        output.scrollTop = output.scrollHeight;
                    }
                } catch (error) {
                    // Hiển thị lỗi kết nối
                    const errorMessage = document.createElement('p');
                    errorMessage.className = 'text-red-400';
                    errorMessage.textContent = '✗ Connection error. Please try again.';
                    output.appendChild(errorMessage);
                    
                    // Scroll xuống cuối
                    output.scrollTop = output.scrollHeight;
                }
            } else {
                // Command không hợp lệ
                const errorMessage = document.createElement('p');
                errorMessage.className = 'text-red-400';
                errorMessage.textContent = `✗ Command not found: ${inputValue}`;
                output.appendChild(errorMessage);
                
                const hintMessage = document.createElement('p');
                hintMessage.className = 'text-gray-500';
                hintMessage.textContent = 'Hint: Enter 1 to login';
                output.appendChild(hintMessage);
                
                // Scroll xuống cuối
                output.scrollTop = output.scrollHeight;
            }
        }
    });

    // Auto focus vào input khi trang load
    terminalInput.focus();
});