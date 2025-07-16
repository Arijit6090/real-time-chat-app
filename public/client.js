class ChatApp {
    constructor() {
        this.socket = null;
        this.username = null;
        this.currentPrivateRecipient = null;
        this.typingTimeout = null;
        this.messageHistory = new Map(); // Store messages per user
        this.connectedUsers = [];
        this.currentConversationUser = null;
        this.unreadCounts = new Map(); // Track unread message counts per user
        
        this.initializeApp();
    }

    initializeApp() {
        this.loadStoredData();
        this.bindEventListeners();
        this.showInitialView();
    }

    loadStoredData() {
        // Load username from localStorage
        this.username = localStorage.getItem('chatUsername');
        
        // Load message history from localStorage
        const storedHistory = localStorage.getItem('chatHistory');
        if (storedHistory) {
            try {
                const parsed = JSON.parse(storedHistory);
                // Validate that each value is an array before storing
                this.messageHistory = new Map();
                Object.entries(parsed).forEach(([user, messages]) => {
                    if (Array.isArray(messages)) {
                        this.messageHistory.set(user, messages);
                    } else {
                        // Initialize as empty array if not a valid array
                        this.messageHistory.set(user, []);
                    }
                });
            } catch (error) {
                console.error('Error parsing stored message history:', error);
                this.messageHistory = new Map();
            }
        }
        
        // Load unread counts from localStorage
        const storedUnreadCounts = localStorage.getItem('chatUnreadCounts');
        if (storedUnreadCounts) {
            try {
                const parsed = JSON.parse(storedUnreadCounts);
                this.unreadCounts = new Map(Object.entries(parsed));
            } catch (error) {
                console.error('Error parsing stored unread counts:', error);
                this.unreadCounts = new Map();
            }
        }
    }

    showInitialView() {
        if (this.username) {
            this.connectToChat();
        } else {
            this.showUsernameModal();
        }
    }

    showUsernameModal() {
        const modal = document.getElementById('usernameModal');
        const input = document.getElementById('usernameInput');
        
        modal.classList.remove('hidden');
        input.focus();
    }

    hideUsernameModal() {
        const modal = document.getElementById('usernameModal');
        modal.classList.add('hidden');
    }

    bindEventListeners() {
        // Username modal events
        const usernameInput = document.getElementById('usernameInput');
        const joinBtn = document.getElementById('joinBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');

        // Join chat
        joinBtn.addEventListener('click', () => this.handleJoin());
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleJoin();
        });

        // Logout
        logoutBtn.addEventListener('click', () => this.handleLogout());

        // Send message
        sendBtn.addEventListener('click', () => this.sendMessage());
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Typing indicator
        messageInput.addEventListener('input', () => this.handleTyping());

        // Cancel private message on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentPrivateRecipient) {
                this.cancelPrivateMessage();
            }
        });
    }

    handleJoin() {
        const input = document.getElementById('usernameInput');
        const errorDiv = document.getElementById('usernameError');
        const joinBtn = document.getElementById('joinBtn');
        
        const username = input.value.trim();
        
        if (!username) {
            this.showError(errorDiv, 'Please enter a username');
            return;
        }

        if (username.length < 2) {
            this.showError(errorDiv, 'Username must be at least 2 characters');
            return;
        }

        if (username.length > 20) {
            this.showError(errorDiv, 'Username must be less than 20 characters');
            return;
        }

        // Disable join button while connecting
        joinBtn.disabled = true;
        joinBtn.textContent = 'Joining...';
        errorDiv.textContent = '';

        this.username = username;
        this.connectToChat();
    }

    connectToChat() {
        try {
            this.socket = io();
            this.setupSocketListeners();
            this.socket.emit('join', this.username);
            this.updateConnectionStatus('connecting');
        } catch (error) {
            console.error('Connection error:', error);
            this.showError(document.getElementById('usernameError'), 'Failed to connect to chat');
            this.resetJoinButton();
        }
    }

    setupSocketListeners() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus('connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus('disconnected');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.updateConnectionStatus('disconnected');
            this.showError(document.getElementById('usernameError'), 'Connection failed');
            this.resetJoinButton();
        });

        // Chat events
        this.socket.on('joined', (data) => {
            localStorage.setItem('chatUsername', this.username);
            this.hideUsernameModal();
            this.showChatInterface();
            this.displayStoredMessages();
        });


        this.socket.on('privateMessage', (data) => {
            this.addMessage(data);
            this.saveMessageHistory();
        });

        this.socket.on('usersUpdate', (users) => {
            this.connectedUsers = users;
            this.updateUsersList();
        });

        this.socket.on('userTyping', (data) => {
            // Only show typing indicator if it's from the current conversation partner
            if (this.currentConversationUser === data.username || data.from === this.currentConversationUser) {
                this.showTypingIndicator(data.username, data.isTyping);
            }
        });

        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showError(document.getElementById('usernameError'), error.message);
            this.resetJoinButton();
        });
    }

    resetJoinButton() {
        const joinBtn = document.getElementById('joinBtn');
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join Chat';
    }

    showChatInterface() {
        const chatContainer = document.getElementById('chatContainer');
        const currentUsernameSpan = document.getElementById('currentUsername');
        
        chatContainer.classList.remove('hidden');
        currentUsernameSpan.textContent = this.username;
        
        // Show initial no conversation state
        this.showNoConversationState();
        
        // Focus on message input
        document.getElementById('messageInput').focus();
    }

    displayStoredMessages() {
        if (this.currentConversationUser) {
            this.displayConversationMessages(this.currentConversationUser);
        }
    }

    displayConversationMessages(username) {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        
        const userMessages = this.messageHistory.get(username) || [];
        
        // Display messages for this specific conversation
        userMessages.forEach(message => {
            this.displayMessage(message);
        });
        
        this.scrollToBottom();
    }

    addMessage(messageData) {
        if (messageData.type === 'private') {
            // Determine which user this conversation is with
            const conversationUser = messageData.username === this.username ? messageData.to : messageData.from;
            
            // Get or create message array for this user
            if (!this.messageHistory.has(conversationUser)) {
                this.messageHistory.set(conversationUser, []);
            }
            
            const userMessages = this.messageHistory.get(conversationUser);
            userMessages.push(messageData);
            
            // Keep only last 50 messages per conversation
            if (userMessages.length > 50) {
                userMessages.splice(0, userMessages.length - 50);
            }
            
            // Update unread count if message is from another user and not currently viewing their conversation
            if (messageData.username !== this.username && this.currentConversationUser !== conversationUser) {
                const currentCount = this.unreadCounts.get(conversationUser) || 0;
                this.unreadCounts.set(conversationUser, currentCount + 1);
                this.saveUnreadCounts();
                this.updateUsersList(); // Refresh the users list to show updated badge
            }
            
            // Only display if this is the current conversation
            if (this.currentConversationUser === conversationUser) {
                this.displayMessage(messageData);
                this.scrollToBottom();
            }
        }
    }

    displayMessage(messageData) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = this.createMessageElement(messageData);
        chatMessages.appendChild(messageElement);
    }

    createMessageElement(messageData) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        
        const isOwn = messageData.username === this.username;
        
        messageDiv.classList.add(isOwn ? 'own' : 'other');
        messageDiv.classList.add('private');
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        // Only show message content and timestamp
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = messageData.message;
        
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'message-timestamp';
        timestampSpan.textContent = this.formatTimestamp(messageData.timestamp);
        
        messageContent.appendChild(messageText);
        messageContent.appendChild(timestampSpan);
        
        messageDiv.appendChild(messageContent);
        
        return messageDiv;
    }

    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (!message) return;
        
        if (!this.currentPrivateRecipient) {
            this.showError(document.getElementById('messageInput'), 'Please select a user to send a private message');
            return;
        }
        
        this.socket.emit('privateMessage', {
            message: message,
            to: this.currentPrivateRecipient
        });
        
        messageInput.value = '';
        this.stopTyping();
    }

    updateUsersList() {
        const usersList = document.getElementById('usersList');
        const usersCount = document.getElementById('usersCount');
        
        usersList.innerHTML = '';
        
        // Filter out current user and update count
        const otherUsers = this.connectedUsers.filter(user => user.username !== this.username);
        usersCount.textContent = otherUsers.length;
        
        otherUsers.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            
            // Create user item container
            const userItemContent = document.createElement('div');
            userItemContent.className = 'user-item-content';
            
            // Add status indicator
            const statusDot = document.createElement('span');
            statusDot.className = 'status-dot';
            statusDot.textContent = '●';
            statusDot.style.color = user.status === 'online' ? '#4caf50' : '#f44336';
            
            const username = document.createElement('span');
            username.textContent = user.username;
            username.className = 'username-text';
            
            userItemContent.appendChild(statusDot);
            userItemContent.appendChild(username);
            
            // Add unread message badge if there are unread messages
            const unreadCount = this.unreadCounts.get(user.username) || 0;
            if (unreadCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'unread-badge';
                badge.setAttribute('aria-label', `${unreadCount} unread messages from ${user.username}`);
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
                userItem.appendChild(badge);
            }
            
            userItem.appendChild(userItemContent);
            
            userItem.addEventListener('click', () => {
                this.startPrivateMessage(user.username);
            });
            
            usersList.appendChild(userItem);
        });
    }

    startPrivateMessage(username) {
        this.currentPrivateRecipient = username;
        this.currentConversationUser = username;
        
        // Mark messages as read when starting conversation
        this.markMessagesAsRead(username);
        
        this.updatePrivateMessageIndicator();
        this.updateChatHeader(username);
        this.hideNoConversationState();
        this.displayConversationMessages(username);
        
        // Enable message input
        const messageInput = document.getElementById('messageInput');
        messageInput.disabled = false;
        messageInput.placeholder = `Type a private message to ${username}...`;
        document.getElementById('messageInput').focus();
    }

    updateChatHeader(username) {
        const chatHeader = document.querySelector('.chat-header h1');
        chatHeader.textContent = username ? `Chat with ${username}` : 'Real-time Chat';
    }

    cancelPrivateMessage() {
        this.currentPrivateRecipient = null;
        this.currentConversationUser = null;
        this.updatePrivateMessageIndicator();
        this.updateChatHeader(null);
        this.showNoConversationState();
        
        // Disable message input
        const messageInput = document.getElementById('messageInput');
        messageInput.disabled = true;
        messageInput.placeholder = 'Select a user to send a private message...';
    }

    updatePrivateMessageIndicator() {
        const indicator = document.getElementById('privateMessageIndicator');
        
        if (this.currentPrivateRecipient) {
            indicator.textContent = `Private message to ${this.currentPrivateRecipient} (Press Escape to cancel)`;
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    }

    showNoConversationState() {
        const chatMessages = document.getElementById('chatMessages');
        const noConversation = chatMessages.querySelector('.no-conversation');
        
        if (!this.currentPrivateRecipient && this.messageHistory.size === 0) {
            if (noConversation) {
                noConversation.style.display = 'flex';
            }
        }
    }

    hideNoConversationState() {
        const chatMessages = document.getElementById('chatMessages');
        const noConversation = chatMessages.querySelector('.no-conversation');
        
        if (noConversation) {
            noConversation.style.display = 'none';
        }
    }

    handleTyping() {
        if (this.socket) {
            this.socket.emit('typing', { 
                isTyping: true,
                to: this.currentPrivateRecipient 
            });
            
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                this.stopTyping();
            }, 2000);
        }
    }

    stopTyping() {
        if (this.socket) {
            this.socket.emit('typing', { 
                isTyping: false,
                to: this.currentPrivateRecipient 
            });
        }
    }

    showTypingIndicator(username, isTyping) {
        const typingIndicator = document.getElementById('typingIndicator');
        
        if (isTyping) {
            typingIndicator.textContent = `${username} is typing...`;
        } else {
            typingIndicator.textContent = '';
        }
    }

    handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            this.logout();
        }
    }

    logout() {
        localStorage.removeItem('chatUsername');
        localStorage.removeItem('chatHistory');
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        this.username = null;
        this.messageHistory = new Map();
        this.currentPrivateRecipient = null;
        this.currentConversationUser = null;
        
        document.getElementById('chatContainer').classList.add('hidden');
        document.getElementById('usernameInput').value = '';
        document.getElementById('usernameError').textContent = '';
        
        this.showUsernameModal();
    }

    markMessagesAsRead(username) {
        // Clear unread count for this user
        this.unreadCounts.delete(username);
        this.saveUnreadCounts();
        this.updateUsersList(); // Refresh to remove badge
    }
    
    saveUnreadCounts() {
        try {
            // Convert Map to Object for storage
            const countsObject = {};
            this.unreadCounts.forEach((count, user) => {
                if (count > 0) { // Only store non-zero counts
                    countsObject[user] = count;
                }
            });
            localStorage.setItem('chatUnreadCounts', JSON.stringify(countsObject));
        } catch (error) {
            console.error('Error saving unread counts:', error);
        }
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connectionStatus');
        statusElement.className = `connection-status ${status}`;
        
        switch (status) {
            case 'connected':
                statusElement.textContent = 'Connected';
                setTimeout(() => statusElement.textContent = '', 3000);
                break;
            case 'disconnected':
                statusElement.textContent = 'Disconnected';
                break;
            case 'connecting':
                statusElement.textContent = 'Connecting...';
                break;
        }
    }

    saveMessageHistory() {
        try {
            // Convert Map to Object for storage, keeping only last 50 messages per user
            const historyObject = {};
            this.messageHistory.forEach((messages, user) => {
                historyObject[user] = messages.slice(-50);
            });
            localStorage.setItem('chatHistory', JSON.stringify(historyObject));
            this.saveUnreadCounts(); // Also save unread counts when saving message history
        } catch (error) {
            console.error('Error saving message history:', error);
        }
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

// Initialize the chat app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
});