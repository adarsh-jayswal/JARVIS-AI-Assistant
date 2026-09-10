document.addEventListener("DOMContentLoaded", async () => {
    // --- USER SESSION & STATE CONTEXT ---
    let currentUser = { id: "guest", name: "User", email: "" };
    
    // Fetch logged in user info
    try {
        const res = await fetch("/api/me");
        if (res.ok) {
            const data = await res.json();
            currentUser = data;
        }
    } catch (e) {
        console.warn("Could not fetch user session:", e);
    }

    function getStorageKey(key) {
        return `jarvis_${key}_${currentUser.id}`;
    }

    const CONFIG = {
        userName: currentUser.name || "User",
        userEmail: currentUser.email || "",
        userAvatar: localStorage.getItem(getStorageKey("user_avatar")) || null,
        logoUrl: window.JARVIS_LOGO_URL || "/static/images/jarvis_logo.jpg"
    };

    let pendingAvatarDataUrl = CONFIG.userAvatar;

    // DOM ELEMENTS - PROFILE & SETTINGS
    const profileUserName = document.getElementById("profileUserName");
    const profileAvatarBadge = document.getElementById("profileAvatarBadge");
    const userNameInput = document.getElementById("userNameInput");
    const avatarFileInput = document.getElementById("avatarFileInput");
    const removeAvatarBtn = document.getElementById("removeAvatarBtn");
    const saveProfileBtn = document.getElementById("saveProfileBtn");
    const profileStatusToast = document.getElementById("profileStatusToast");
    const profileEditorPreview = document.getElementById("profileEditorPreview");
    const settingsUserName = document.getElementById("settingsUserName");
    const settingsUserEmail = document.getElementById("settingsUserEmail");

    function updateProfileUI() {
        const initial = (CONFIG.userName || "U").charAt(0).toUpperCase();

        if (profileUserName) profileUserName.textContent = CONFIG.userName;
        if (settingsUserName) settingsUserName.textContent = CONFIG.userName;
        if (settingsUserEmail) settingsUserEmail.textContent = CONFIG.userEmail || "Personal Account";

        if (profileAvatarBadge) {
            if (CONFIG.userAvatar) {
                profileAvatarBadge.innerHTML = `<img src="${CONFIG.userAvatar}" alt="User Avatar" class="profile-avatar-img">`;
            } else {
                profileAvatarBadge.innerHTML = `<div class="profile-avatar-fallback">${initial}</div>`;
            }
        }

        if (profileEditorPreview) {
            if (pendingAvatarDataUrl) {
                profileEditorPreview.innerHTML = `<img src="${pendingAvatarDataUrl}" alt="Avatar Preview" class="profile-preview-img">`;
            } else {
                profileEditorPreview.innerHTML = `<span id="profileEditorBadge">${initial}</span>`;
            }
        }

        if (removeAvatarBtn) {
            removeAvatarBtn.style.display = pendingAvatarDataUrl ? "inline-flex" : "none";
        }

        if (userNameInput && document.activeElement !== userNameInput) {
            userNameInput.value = CONFIG.userName;
        }

        setDynamicGreeting();
    }

    // CANVAS IMAGE COMPRESSION HELPER
    function compressImage(file, callback) {
        if (!file || !file.type.startsWith("image/")) {
            showToast("Please select a valid image file.", "error");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const maxDim = 128;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxDim) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    }
                } else {
                    if (height > maxDim) {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
                callback(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // PROFILE HANDLERS
    if (avatarFileInput) {
        avatarFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                compressImage(file, (dataUrl) => {
                    pendingAvatarDataUrl = dataUrl;
                    updateProfileUI();
                });
            }
        });
    }

    if (removeAvatarBtn) {
        removeAvatarBtn.addEventListener("click", () => {
            pendingAvatarDataUrl = null;
            if (avatarFileInput) avatarFileInput.value = "";
            updateProfileUI();
        });
    }

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener("click", async () => {
            const newName = userNameInput ? (userNameInput.value.trim() || "User") : "User";
            CONFIG.userName = newName;

            try {
                await fetch("/api/profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: newName })
                });
            } catch (e) {
                console.warn("Could not save name to server:", e);
            }

            if (pendingAvatarDataUrl) {
                CONFIG.userAvatar = pendingAvatarDataUrl;
                localStorage.setItem(getStorageKey("user_avatar"), pendingAvatarDataUrl);
            } else {
                CONFIG.userAvatar = null;
                localStorage.removeItem(getStorageKey("user_avatar"));
            }

            updateProfileUI();
            showToast("Profile updated successfully", "success");
        });
    }

    // LOGOUT HANDLERS
    const logoutBtn = document.getElementById("logoutBtn");
    const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");

    async function handleLogout() {
        try {
            await fetch("/logout", { method: "POST" });
        } catch (e) {
            console.warn("Logout request failed:", e);
        }
        window.location.href = "/login";
    }

    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
    if (settingsLogoutBtn) settingsLogoutBtn.addEventListener("click", handleLogout);

    // DYNAMIC GREETING BY TIME
    const greetingHeading = document.getElementById("greetingHeading");
    function setDynamicGreeting() {
        if (!greetingHeading) return;
        const hour = new Date().getHours();
        let greetingPrefix = "Good afternoon";
        if (hour < 12) greetingPrefix = "Good morning";
        else if (hour >= 18) greetingPrefix = "Good evening";

        const nameStr = (CONFIG.userName && CONFIG.userName !== "User") ? `, ${CONFIG.userName}` : "";
        greetingHeading.textContent = `${greetingPrefix}${nameStr}.`;
    }

    updateProfileUI();

    // TOAST UTILITY
    function showToast(message, type = "info") {
        const container = document.getElementById("toastContainer");
        if (!container) return;
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        
        let icon = "ℹ️";
        if (type === "success") icon = "✓";
        if (type === "error") icon = "⚠️";

        toast.innerHTML = `<span style="font-weight:700;">${icon}</span> <span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    // STATE MANAGEMENT
    let activeMode = "chat";
    let activeDevAction = "debug";
    let isProcessing = false;
    let speechRecognition = null;
    let isListening = false;

    // --- MULTI-CONVERSATION ENGINE ---
    let chats = [];
    let activeChatId = null;

    function loadSavedChats() {
        try {
            const raw = localStorage.getItem(getStorageKey("chats"));
            chats = raw ? JSON.parse(raw) : [];
        } catch (e) {
            chats = [];
        }

        const savedActiveId = localStorage.getItem(getStorageKey("active_chat"));

        if (chats.length === 0) {
            // Create initial fresh chat
            createNewChat(false);
        } else {
            const exists = chats.find(c => c.id === savedActiveId);
            activeChatId = exists ? savedActiveId : chats[0].id;
            renderSidebarChats();
            renderActiveChat();
        }
    }

    function saveChatsToStorage() {
        localStorage.setItem(getStorageKey("chats"), JSON.stringify(chats));
        if (activeChatId) {
            localStorage.setItem(getStorageKey("active_chat"), activeChatId);
        }
    }

    function createNewChat(notify = true) {
        const newChat = {
            id: `chat_${Date.now()}`,
            title: "New Conversation",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            messages: []
        };

        chats.unshift(newChat);
        activeChatId = newChat.id;
        saveChatsToStorage();

        renderSidebarChats();
        renderActiveChat();

        if (chatInput) {
            chatInput.value = "";
            chatInput.focus();
        }

        if (notify) {
            showToast("New chat created", "success");
        }
    }

    function renderSidebarChats(filter = "") {
        const sidebarChatsList = document.getElementById("sidebarChatsList");
        if (!sidebarChatsList) return;

        sidebarChatsList.innerHTML = "";

        const query = filter.trim().toLowerCase();
        const filtered = chats.filter(c => {
            if (!query) return true;
            if (c.title.toLowerCase().includes(query)) return true;
            return c.messages.some(m => m.text && m.text.toLowerCase().includes(query));
        });

        if (filtered.length === 0) {
            sidebarChatsList.innerHTML = `<div style="padding: 10px; font-size: 0.78rem; color: var(--text-muted); text-align: center;">No chats found</div>`;
            return;
        }

        filtered.forEach(chat => {
            const item = document.createElement("div");
            item.className = `sidebar-chat-item ${chat.id === activeChatId ? "active" : ""}`;

            item.innerHTML = `
                <div class="chat-title-wrapper">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    <span class="chat-title">${escapeHtml(chat.title)}</span>
                </div>
                <div class="chat-actions">
                    <button class="chat-action-btn rename-btn" title="Rename Chat">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="chat-action-btn delete-btn" title="Delete Chat">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;

            item.addEventListener("click", (e) => {
                if (e.target.closest(".chat-action-btn")) return;
                selectChat(chat.id);
            });

            item.querySelector(".rename-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                openRenameModal(chat.id);
            });

            item.querySelector(".delete-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                openDeleteModal(chat.id);
            });

            sidebarChatsList.appendChild(item);
        });
    }

    function selectChat(chatId) {
        activeChatId = chatId;
        saveChatsToStorage();
        renderSidebarChats();
        renderActiveChat();
        switchView("chatView");
    }

    function renderActiveChat() {
        const activeChat = chats.find(c => c.id === activeChatId);
        if (!activeChat) return;

        // Update Top Bar View Title
        if (viewTitle) {
            viewTitle.textContent = activeChat.title === "New Conversation" ? "JARVIS Chat" : activeChat.title;
        }

        const messageList = document.getElementById("messageList");
        const welcomeScreen = document.getElementById("welcomeScreen");

        messageList.innerHTML = "";

        if (activeChat.messages.length === 0) {
            welcomeScreen.style.display = "flex";
            messageList.style.display = "none";
        } else {
            welcomeScreen.style.display = "none";
            messageList.style.display = "flex";
            activeChat.messages.forEach(msg => appendMessageUI(msg));
            scrollToBottom();
        }
    }

    // SEARCH CHATS INPUT
    const chatsSearchInput = document.getElementById("chatsSearchInput");
    if (chatsSearchInput) {
        chatsSearchInput.addEventListener("input", (e) => {
            renderSidebarChats(e.target.value);
        });
    }

    // NEW CHAT BUTTON
    const newChatBtn = document.getElementById("newChatBtn");
    if (newChatBtn) {
        newChatBtn.addEventListener("click", () => {
            createNewChat(true);
            switchView("chatView");
        });
    }

    // RENAME CHAT MODAL LOGIC
    let targetRenameChatId = null;
    const renameModal = document.getElementById("renameModal");
    const renameChatInput = document.getElementById("renameChatInput");
    const confirmRenameBtn = document.getElementById("confirmRenameBtn");
    const cancelRenameBtn = document.getElementById("cancelRenameBtn");

    function openRenameModal(chatId) {
        targetRenameChatId = chatId;
        const chat = chats.find(c => c.id === chatId);
        if (chat && renameChatInput) {
            renameChatInput.value = chat.title;
            renameModal.style.display = "flex";
            renameChatInput.focus();
        }
    }

    if (cancelRenameBtn) {
        cancelRenameBtn.addEventListener("click", () => {
            renameModal.style.display = "none";
        });
    }

    if (confirmRenameBtn) {
        confirmRenameBtn.addEventListener("click", () => {
            const newTitle = renameChatInput.value.trim();
            if (newTitle && targetRenameChatId) {
                const chat = chats.find(c => c.id === targetRenameChatId);
                if (chat) {
                    chat.title = newTitle;
                    chat.updatedAt = new Date().toISOString();
                    saveChatsToStorage();
                    renderSidebarChats();
                    if (targetRenameChatId === activeChatId && viewTitle) {
                        viewTitle.textContent = newTitle;
                    }
                    showToast("Chat renamed", "success");
                }
            }
            renameModal.style.display = "none";
        });
    }

    // DELETE CHAT MODAL LOGIC
    let targetDeleteChatId = null;
    const deleteModal = document.getElementById("deleteModal");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

    function openDeleteModal(chatId) {
        targetDeleteChatId = chatId;
        deleteModal.style.display = "flex";
    }

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener("click", () => {
            deleteModal.style.display = "none";
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", () => {
            if (targetDeleteChatId) {
                chats = chats.filter(c => c.id !== targetDeleteChatId);

                if (chats.length === 0) {
                    createNewChat(false);
                } else if (targetDeleteChatId === activeChatId) {
                    activeChatId = chats[0].id;
                }

                saveChatsToStorage();
                renderSidebarChats();
                renderActiveChat();
                showToast("Chat deleted", "info");
            }
            deleteModal.style.display = "none";
        });
    }

    // CLEAR CHAT MODAL LOGIC
    const clearChatBtn = document.getElementById("clearChatBtn");
    const clearModal = document.getElementById("clearModal");
    const confirmClearBtn = document.getElementById("confirmClearBtn");
    const cancelClearBtn = document.getElementById("cancelClearBtn");

    if (clearChatBtn) {
        clearChatBtn.addEventListener("click", () => {
            clearModal.style.display = "flex";
        });
    }

    if (cancelClearBtn) {
        cancelClearBtn.addEventListener("click", () => {
            clearModal.style.display = "none";
        });
    }

    if (confirmClearBtn) {
        confirmClearBtn.addEventListener("click", () => {
            const activeChat = chats.find(c => c.id === activeChatId);
            if (activeChat) {
                activeChat.messages = [];
                activeChat.updatedAt = new Date().toISOString();
                saveChatsToStorage();
                renderActiveChat();
                showToast("Conversation cleared", "info");
            }
            clearModal.style.display = "none";
        });
    }

    // --- THEME ENGINE ---
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const themeSelect = document.getElementById("themeSelect");

    function applyTheme(theme) {
        if (theme === "system") {
            const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            document.documentElement.setAttribute("data-theme", systemDark ? "dark" : "light");
        } else {
            document.documentElement.setAttribute("data-theme", theme);
        }
        localStorage.setItem(getStorageKey("theme"), theme);
        if (themeSelect) themeSelect.value = theme;
    }

    const savedTheme = localStorage.getItem(getStorageKey("theme")) || "dark";
    applyTheme(savedTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme");
            applyTheme(current === "dark" ? "light" : "dark");
        });
    }

    if (themeSelect) {
        themeSelect.addEventListener("change", (e) => {
            applyTheme(e.target.value);
        });
    }

    // --- SIDEBAR & ROUTER NAVIGATION ---
    const appSidebar = document.getElementById("appSidebar");
    const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
    const mobileMenuBtn = document.getElementById("mobileMenuBtn");
    const navItems = document.querySelectorAll(".nav-item[data-view]");
    const viewPanels = document.querySelectorAll(".view-panel");
    const viewTitle = document.getElementById("viewTitle");

    const viewTitles = {
        chatView: "JARVIS Chat",
        summarizeView: "Email Summarizer",
        developerView: "Developer Mode",
        notesView: "Notes & Task Assistant",
        historyView: "Conversation History",
        settingsView: "JARVIS Settings"
    };

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener("click", () => {
            appSidebar.classList.toggle("collapsed");
        });
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener("click", () => {
            appSidebar.classList.toggle("mobile-open");
        });
    }

    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const targetViewId = item.getAttribute("data-view");
            switchView(targetViewId);
            appSidebar.classList.remove("mobile-open");
        });
    });

    function switchView(viewId) {
        navItems.forEach(nav => {
            if (nav.getAttribute("data-view") === viewId) {
                nav.classList.add("active");
            } else {
                nav.classList.remove("active");
            }
        });

        viewPanels.forEach(panel => {
            if (panel.id === viewId) {
                panel.classList.add("active");
                panel.style.display = "flex";
            } else {
                panel.classList.remove("active");
                panel.style.display = "none";
            }
        });

        if (viewId === "chatView") {
            const activeChat = chats.find(c => c.id === activeChatId);
            if (viewTitle) {
                viewTitle.textContent = (activeChat && activeChat.title !== "New Conversation") ? activeChat.title : "JARVIS Chat";
            }
        } else if (viewTitles[viewId]) {
            viewTitle.textContent = viewTitles[viewId];
        }

        if (viewId === "historyView") renderHistoryView();
        if (viewId === "notesView") loadNotes();
    }

    // --- CHAT MODE PILLS ---
    const modePills = document.querySelectorAll(".mode-pill");
    const defaultModeSelect = document.getElementById("defaultModeSelect");

    modePills.forEach(pill => {
        pill.addEventListener("click", () => {
            modePills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            activeMode = pill.getAttribute("data-mode");
        });
    });

    if (defaultModeSelect) {
        defaultModeSelect.addEventListener("change", (e) => {
            activeMode = e.target.value;
            modePills.forEach(p => {
                if (p.getAttribute("data-mode") === activeMode) p.classList.add("active");
                else p.classList.remove("active");
            });
        });
    }

    // --- CHAT COMPOSER & AUTO-RESIZE ---
    const chatInput = document.getElementById("chatInput");
    const chatForm = document.getElementById("chatForm");
    const sendBtn = document.getElementById("sendBtn");
    const chatContainer = document.getElementById("chatContainer");
    const welcomeScreen = document.getElementById("welcomeScreen");
    const messageList = document.getElementById("messageList");
    const typingIndicator = document.getElementById("typingIndicator");

    if (chatInput) {
        chatInput.addEventListener("input", autoResizeInput);
        chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isProcessing && chatInput.value.trim()) {
                    chatForm.requestSubmit();
                }
            }
        });
    }

    function autoResizeInput() {
        if (!chatInput) return;
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
    }

    // --- STARTER SUGGESTION CARDS ---
    const starterCards = document.querySelectorAll(".starter-card");
    starterCards.forEach(card => {
        card.addEventListener("click", () => {
            const promptText = card.getAttribute("data-prompt");
            if (promptText && chatInput) {
                chatInput.value = promptText;
                autoResizeInput();
                chatInput.focus();
                chatForm.requestSubmit();
            }
        });
    });

    // --- VOICE INPUT (WEB SPEECH API) ---
    const micBtn = document.getElementById("micBtn");
    if (micBtn && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SpeechRec();
        speechRecognition.continuous = false;
        speechRecognition.interimResults = false;
        speechRecognition.lang = 'en-US';

        speechRecognition.onstart = () => {
            isListening = true;
            micBtn.classList.add("listening");
            micBtn.title = "Listening... Speak now";
        };

        speechRecognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            if (chatInput) {
                chatInput.value = (chatInput.value + " " + transcript).trim();
                autoResizeInput();
            }
        };

        speechRecognition.onerror = (e) => {
            console.warn("Speech recognition error:", e.error);
            stopListening();
        };

        speechRecognition.onend = () => {
            stopListening();
        };

        micBtn.addEventListener("click", () => {
            if (isListening) {
                speechRecognition.stop();
            } else {
                speechRecognition.start();
            }
        });
    } else if (micBtn) {
        micBtn.addEventListener("click", () => {
            showToast("Voice input isn't supported in this browser.", "error");
        });
    }

    function stopListening() {
        isListening = false;
        if (micBtn) {
            micBtn.classList.remove("listening");
            micBtn.title = "Voice Input (Speech-to-Text)";
        }
    }

    // --- CHAT SUBMISSION ---
    if (chatForm) {
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const userText = chatInput.value.trim();
            if (!userText || isProcessing) return;

            sendMessage(userText);
        });
    }

    async function sendMessage(text) {
        const activeChat = chats.find(c => c.id === activeChatId);
        if (!activeChat) return;

        welcomeScreen.style.display = "none";
        messageList.style.display = "flex";

        const userMsg = { role: "user", text: text, time: getCurrentTime() };
        activeChat.messages.push(userMsg);
        appendMessageUI(userMsg);

        // Generate title if new conversation
        if (activeChat.title === "New Conversation") {
            const titleText = text.length > 32 ? text.substring(0, 32) + "..." : text;
            activeChat.title = titleText;
            if (viewTitle) viewTitle.textContent = titleText;
        }

        activeChat.updatedAt = new Date().toISOString();
        saveChatsToStorage();
        renderSidebarChats();

        chatInput.value = "";
        chatInput.style.height = "auto";

        setProcessing(true);
        showTypingIndicator(true);

        try {
            const response = await fetch("/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: text, mode: activeMode })
            });

            const data = await response.json();
            showTypingIndicator(false);

            if (response.ok && data.answer) {
                const assistantMsg = { role: "assistant", text: data.answer, time: getCurrentTime() };
                activeChat.messages.push(assistantMsg);
                appendMessageUI(assistantMsg);

                activeChat.updatedAt = new Date().toISOString();
                saveChatsToStorage();
                renderSidebarChats();
            } else {
                const errorMsg = data.error || "Something went wrong while contacting JARVIS. Please try again.";
                appendMessageUI({ role: "assistant", text: `⚠️ ${errorMsg}`, isError: true, time: getCurrentTime() });
            }
        } catch (err) {
            console.error("Fetch error:", err);
            showTypingIndicator(false);
            appendMessageUI({ role: "assistant", text: "⚠️ Network connection error. Please try again.", isError: true, time: getCurrentTime() });
        } finally {
            setProcessing(false);
            if (chatInput) chatInput.focus();
        }
    }

    function appendMessageUI(msg) {
        const group = document.createElement("div");
        group.classList.add("message-group", msg.role);
        if (msg.isError) group.classList.add("error-message");

        const bubble = document.createElement("div");
        bubble.classList.add("message-bubble");

        if (msg.role === "user") {
            bubble.textContent = msg.text;
        } else {
            bubble.innerHTML = renderMarkdown(msg.text);

            const actions = document.createElement("div");
            actions.classList.add("message-actions");

            const copyBtn = document.createElement("button");
            copyBtn.classList.add("action-chip");
            copyBtn.textContent = "📋 Copy";
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(msg.text);
                copyBtn.textContent = "✓ Copied";
                showToast("Copied to clipboard", "success");
                setTimeout(() => copyBtn.textContent = "📋 Copy", 2000);
            });

            const regenBtn = document.createElement("button");
            regenBtn.classList.add("action-chip");
            regenBtn.textContent = "🔄 Regenerate";
            regenBtn.addEventListener("click", () => {
                const activeChat = chats.find(c => c.id === activeChatId);
                if (activeChat) {
                    for (let i = activeChat.messages.length - 1; i >= 0; i--) {
                        if (activeChat.messages[i].role === "user") {
                            sendMessage(activeChat.messages[i].text);
                            break;
                        }
                    }
                }
            });

            actions.appendChild(copyBtn);
            actions.appendChild(regenBtn);
            group.appendChild(bubble);
            group.appendChild(actions);
        }

        const time = document.createElement("div");
        time.classList.add("message-time");
        time.textContent = msg.time || getCurrentTime();

        if (msg.role === "user") {
            group.appendChild(bubble);
        }
        group.appendChild(time);

        messageList.appendChild(group);
        scrollToBottom();
    }

    function setProcessing(processing) {
        isProcessing = processing;
        if (sendBtn) sendBtn.disabled = processing;
        if (chatInput) chatInput.disabled = processing;
    }

    function showTypingIndicator(show) {
        if (typingIndicator) {
            typingIndicator.style.display = show ? "flex" : "none";
            if (show) scrollToBottom();
        }
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        });
    }

    function getCurrentTime() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // --- HISTORY VIEW ENGINE ---
    function renderHistoryView() {
        const historyContainer = document.getElementById("historyContainer");
        if (!historyContainer) return;

        if (chats.length === 0) {
            historyContainer.innerHTML = `<p class="welcome-subtitle">No saved conversations found.</p>`;
            return;
        }

        historyContainer.innerHTML = "";
        chats.forEach(session => {
            const card = document.createElement("div");
            card.classList.add("history-card");

            const formattedDate = new Date(session.updatedAt || session.createdAt).toLocaleDateString();

            card.innerHTML = `
                <div>
                    <h4>${escapeHtml(session.title)}</h4>
                    <p>${session.messages.length} messages &bull; Updated ${formattedDate}</p>
                </div>
                <div class="history-card-footer">
                    <button class="btn secondary-btn sm load-session-btn">Open</button>
                    <button class="btn danger-btn sm delete-session-btn">Delete</button>
                </div>
            `;

            card.querySelector(".load-session-btn").addEventListener("click", () => {
                selectChat(session.id);
            });

            card.querySelector(".delete-session-btn").addEventListener("click", () => {
                openDeleteModal(session.id);
            });

            historyContainer.appendChild(card);
        });
    }

    const clearAllHistoryBtn = document.getElementById("clearAllHistoryBtn");
    if (clearAllHistoryBtn) {
        clearAllHistoryBtn.addEventListener("click", () => {
            if (confirm("Are you sure you want to delete all chat history?")) {
                chats = [];
                createNewChat(false);
                renderHistoryView();
                showToast("All chat history cleared", "info");
            }
        });
    }

    // --- DEVELOPER MODE ENGINE ---
    const devForm = document.getElementById("devForm");
    const devCodeInput = document.getElementById("devCodeInput");
    const devSubmitBtn = document.getElementById("devSubmitBtn");
    const devLoading = document.getElementById("devLoading");
    const devOutputCard = document.getElementById("devOutputCard");
    const devOutputText = document.getElementById("devOutputText");
    const devActionBtns = document.querySelectorAll(".dev-action-btn");

    devActionBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            devActionBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeDevAction = btn.getAttribute("data-action");
        });
    });

    if (devForm) {
        devForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const code = devCodeInput.value.trim();
            if (!code) return;

            devSubmitBtn.disabled = true;
            devLoading.style.display = "flex";
            devOutputCard.style.display = "none";

            try {
                const res = await fetch("/developer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: activeDevAction, code: code })
                });

                const data = await res.json();
                devLoading.style.display = "none";

                if (res.ok && data.result) {
                    devOutputText.innerHTML = renderMarkdown(data.result);
                    devOutputCard.style.display = "block";
                } else {
                    devOutputText.innerHTML = `<p class="error-text">⚠️ ${escapeHtml(data.error || "Failed to analyze code.")}</p>`;
                    devOutputCard.style.display = "block";
                }
            } catch (err) {
                console.error("Developer mode error:", err);
                devLoading.style.display = "none";
                devOutputText.innerHTML = `<p class="error-text">⚠️ Network error while analyzing code.</p>`;
                devOutputCard.style.display = "block";
            } finally {
                devSubmitBtn.disabled = false;
            }
        });
    }

    // --- EMAIL SUMMARIZER ENGINE ---
    const emailForm = document.getElementById("emailForm");
    const emailInput = document.getElementById("emailInput");
    const summarizeSubmitBtn = document.getElementById("summarizeSubmitBtn");
    const summarizeLoading = document.getElementById("summarizeLoading");
    const summaryOutputCard = document.getElementById("summaryOutputCard");
    const summaryOutputText = document.getElementById("summaryOutputText");

    if (emailForm) {
        emailForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const content = emailInput.value.trim();
            if (!content) return;

            summarizeSubmitBtn.disabled = true;
            summarizeLoading.style.display = "flex";
            summaryOutputCard.style.display = "none";

            try {
                const res = await fetch("/summarize", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: content })
                });

                const data = await res.json();
                summarizeLoading.style.display = "none";

                if (res.ok && data.response) {
                    summaryOutputText.innerHTML = renderMarkdown(data.response);
                    summaryOutputCard.style.display = "block";
                } else {
                    summaryOutputText.innerHTML = `<p class="error-text">⚠️ ${escapeHtml(data.error || "Failed to summarize email.")}</p>`;
                    summaryOutputCard.style.display = "block";
                }
            } catch (err) {
                console.error("Email summarize error:", err);
                summarizeLoading.style.display = "none";
                summaryOutputText.innerHTML = `<p class="error-text">⚠️ Network error while summarizing email.</p>`;
                summaryOutputCard.style.display = "block";
            } finally {
                summarizeSubmitBtn.disabled = false;
            }
        });
    }

    // --- NOTES ENGINE (LOCAL STORAGE + AI ENHANCEMENTS) ---
    let notes = [];
    let activeNoteId = null;

    const notesList = document.getElementById("notesList");
    const noteTitleInput = document.getElementById("noteTitleInput");
    const noteBodyInput = document.getElementById("noteBodyInput");
    const newNoteBtn = document.getElementById("newNoteBtn");
    const saveNoteBtn = document.getElementById("saveNoteBtn");
    const deleteNoteBtn = document.getElementById("deleteNoteBtn");
    const notesSearchInput = document.getElementById("notesSearchInput");
    const noteAiBtns = document.querySelectorAll(".notes-ai-btn");
    const noteAiResultCard = document.getElementById("noteAiResultCard");
    const noteAiResultText = document.getElementById("noteAiResultText");

    function loadNotes(filter = "") {
        try {
            notes = JSON.parse(localStorage.getItem(getStorageKey("notes")) || "[]");
        } catch (e) {
            notes = [];
        }

        if (!notesList) return;
        notesList.innerHTML = "";

        const filtered = notes.filter(n => 
            n.title.toLowerCase().includes(filter.toLowerCase()) || 
            n.body.toLowerCase().includes(filter.toLowerCase())
        );

        if (filtered.length === 0) {
            notesList.innerHTML = `<p class="welcome-subtitle" style="font-size: 0.8rem; padding: 10px;">No notes found.</p>`;
            return;
        }

        filtered.forEach(note => {
            const item = document.createElement("div");
            item.classList.add("note-item");
            if (note.id === activeNoteId) item.classList.add("active");

            item.innerHTML = `
                <h4>${escapeHtml(note.title || "Untitled Note")}</h4>
                <p>${escapeHtml(note.body.substring(0, 40) || "Empty note...")}</p>
            `;

            item.addEventListener("click", () => {
                activeNoteId = note.id;
                noteTitleInput.value = note.title;
                noteBodyInput.value = note.body;
                if (noteAiResultCard) noteAiResultCard.style.display = "none";
                loadNotes(filter);
            });

            notesList.appendChild(item);
        });
    }

    if (newNoteBtn) {
        newNoteBtn.addEventListener("click", () => {
            const newNote = { id: Date.now().toString(), title: "New Note", body: "" };
            notes.unshift(newNote);
            localStorage.setItem(getStorageKey("notes"), JSON.stringify(notes));
            activeNoteId = newNote.id;
            if (noteTitleInput) noteTitleInput.value = newNote.title;
            if (noteBodyInput) noteBodyInput.value = newNote.body;
            if (noteAiResultCard) noteAiResultCard.style.display = "none";
            loadNotes();
        });
    }

    if (saveNoteBtn) {
        saveNoteBtn.addEventListener("click", () => {
            if (!activeNoteId) return;
            const note = notes.find(n => n.id === activeNoteId);
            if (note) {
                note.title = noteTitleInput.value.trim() || "Untitled Note";
                note.body = noteBodyInput.value;
                localStorage.setItem(getStorageKey("notes"), JSON.stringify(notes));
                loadNotes();
                showToast("Note saved successfully", "success");
            }
        });
    }

    if (deleteNoteBtn) {
        deleteNoteBtn.addEventListener("click", () => {
            if (!activeNoteId) return;
            notes = notes.filter(n => n.id !== activeNoteId);
            localStorage.setItem(getStorageKey("notes"), JSON.stringify(notes));
            activeNoteId = null;
            if (noteTitleInput) noteTitleInput.value = "";
            if (noteBodyInput) noteBodyInput.value = "";
            if (noteAiResultCard) noteAiResultCard.style.display = "none";
            loadNotes();
            showToast("Note deleted", "info");
        });
    }

    if (notesSearchInput) {
        notesSearchInput.addEventListener("input", (e) => {
            loadNotes(e.target.value);
        });
    }

    noteAiBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
            const noteText = noteBodyInput ? noteBodyInput.value.trim() : "";
            if (!noteText) {
                showToast("Please add text to your note first", "error");
                return;
            }

            const aiAction = btn.getAttribute("data-ai-action");
            if (noteAiResultCard) noteAiResultCard.style.display = "none";
            btn.disabled = true;

            try {
                const res = await fetch("/notes/ai", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: aiAction, content: noteText })
                });
                const data = await res.json();

                if (res.ok && data.result) {
                    if (noteAiResultText) noteAiResultText.innerHTML = renderMarkdown(data.result);
                    if (noteAiResultCard) noteAiResultCard.style.display = "block";
                } else {
                    showToast(data.error || "Failed to process note.", "error");
                }
            } catch (err) {
                console.error("Notes AI error:", err);
                showToast("Network error.", "error");
            } finally {
                btn.disabled = false;
            }
        });
    });

    // --- INITIALIZE CHATS ---
    loadSavedChats();

    // --- HTML SANITIZATION & MARKDOWN RENDERER ---
    function escapeHtml(text) {
        if (!text) return "";
        const div = document.createElement('div');
        div.innerText = text;
        return div.innerHTML;
    }

    function renderMarkdown(rawText) {
        if (!rawText) return "";

        let text = escapeHtml(rawText);

        // Code blocks: ```code```
        text = text.replace(/```([\s\S]*?)```/g, (match, code) => {
            return `<pre class="code-block"><code>${code.trim()}</code></pre>`;
        });

        // Inline code: `code`
        text = text.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

        // Headings: ### Title
        text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');

        // Bold & Italic
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');

        // Lists
        const lines = text.split('\n');
        let html = '';
        let inList = false;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (/^[\*\-]\s+/.test(trimmed)) {
                if (!inList) { html += '<ul>'; inList = 'ul'; }
                html += `<li>${trimmed.replace(/^[\*\-]\s+/, '')}</li>`;
            } else if (/^\d+\.\s+/.test(trimmed)) {
                if (!inList) { html += '<ol>'; inList = 'ol'; }
                html += `<li>${trimmed.replace(/^\d+\.\s+/, '')}</li>`;
            } else {
                if (inList) { html += inList === 'ul' ? '</ul>' : '</ol>'; inList = false; }
                if (trimmed.length > 0) {
                    if (trimmed.startsWith('<pre') || trimmed.startsWith('<h3') || trimmed.endsWith('</pre>')) {
                        html += trimmed;
                    } else {
                        html += `<p>${trimmed}</p>`;
                    }
                }
            }
        });

        if (inList) html += inList === 'ul' ? '</ul>' : '</ol>';
        return html;
    }
});
