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
        stopSpeaking();
        if (isListening && speechRecognition) {
            try { speechRecognition.stop(); } catch (e) {}
        }
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
    let isListening = false;
    let isSpeaking = false;
    let speechRecognition = null;
    let availableVoices = [];

    // --- ASSISTANT STATUS BADGE UI ---
    const assistantStatusBadge = document.getElementById("assistantStatusBadge");
    const assistantStatusText = document.getElementById("assistantStatusText");

    function setAssistantStatus(status) {
        if (!assistantStatusBadge || !assistantStatusText) return;
        
        assistantStatusBadge.className = `assistant-status-badge ${status}`;
        
        if (status === "listening") {
            assistantStatusText.textContent = "Listening...";
        } else if (status === "thinking") {
            assistantStatusText.textContent = "Thinking...";
        } else if (status === "speaking") {
            assistantStatusText.textContent = "Speaking...";
        } else {
            assistantStatusBadge.className = "assistant-status-badge idle";
            assistantStatusText.textContent = "Ready";
        }
    }

    // --- VOICE ASSISTANT SETTINGS STATE ---
    const voiceSettings = {
        responses: localStorage.getItem(getStorageKey("voice_responses")) || "off",
        handsFree: localStorage.getItem(getStorageKey("hands_free")) || "off",
        recLanguage: localStorage.getItem(getStorageKey("rec_language")) || "en-US",
        voiceName: localStorage.getItem(getStorageKey("voice_name")) || "",
        rate: parseFloat(localStorage.getItem(getStorageKey("voice_rate")) || "1.0"),
        pitch: parseFloat(localStorage.getItem(getStorageKey("voice_pitch")) || "1.0"),
        volume: parseFloat(localStorage.getItem(getStorageKey("voice_volume")) || "1.0")
    };

    // DOM ELEMENTS - VOICE SETTINGS
    const voiceResponsesToggle = document.getElementById("voiceResponsesToggle");
    const handsFreeToggle = document.getElementById("handsFreeToggle");
    const recLanguageSelect = document.getElementById("recLanguageSelect");
    const voiceSelect = document.getElementById("voiceSelect");
    const voiceRateInput = document.getElementById("voiceRateInput");
    const voiceRateValue = document.getElementById("voiceRateValue");
    const voicePitchInput = document.getElementById("voicePitchInput");
    const voicePitchValue = document.getElementById("voicePitchValue");
    const voiceVolumeInput = document.getElementById("voiceVolumeInput");
    const voiceVolumeValue = document.getElementById("voiceVolumeValue");
    const testVoiceBtn = document.getElementById("testVoiceBtn");
    const topStopSpeakBtn = document.getElementById("topStopSpeakBtn");

    function initVoiceSettingsUI() {
        if (voiceResponsesToggle) voiceResponsesToggle.value = voiceSettings.responses;
        if (handsFreeToggle) handsFreeToggle.value = voiceSettings.handsFree;
        if (recLanguageSelect) recLanguageSelect.value = voiceSettings.recLanguage;
        
        if (voiceRateInput) {
            voiceRateInput.value = voiceSettings.rate;
            if (voiceRateValue) voiceRateValue.textContent = voiceSettings.rate.toFixed(1);
        }
        if (voicePitchInput) {
            voicePitchInput.value = voiceSettings.pitch;
            if (voicePitchValue) voicePitchValue.textContent = voiceSettings.pitch.toFixed(1);
        }
        if (voiceVolumeInput) {
            voiceVolumeInput.value = voiceSettings.volume;
            if (voiceVolumeValue) voiceVolumeValue.textContent = voiceSettings.volume.toFixed(1);
        }
    }

    initVoiceSettingsUI();

    if (voiceResponsesToggle) {
        voiceResponsesToggle.addEventListener("change", (e) => {
            voiceSettings.responses = e.target.value;
            localStorage.setItem(getStorageKey("voice_responses"), e.target.value);
            showToast(`Voice responses turned ${e.target.value.toUpperCase()}`, "info");
        });
    }

    if (handsFreeToggle) {
        handsFreeToggle.addEventListener("change", (e) => {
            voiceSettings.handsFree = e.target.value;
            localStorage.setItem(getStorageKey("hands_free"), e.target.value);
            showToast(`Hands-free mode turned ${e.target.value.toUpperCase()}`, "info");
        });
    }

    if (recLanguageSelect) {
        recLanguageSelect.addEventListener("change", (e) => {
            voiceSettings.recLanguage = e.target.value;
            localStorage.setItem(getStorageKey("rec_language"), e.target.value);
            if (speechRecognition) {
                speechRecognition.lang = e.target.value;
            }
            showToast(`Recognition language set to ${e.target.options[e.target.selectedIndex].text}`, "info");
        });
    }

    if (voiceRateInput) {
        voiceRateInput.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            voiceSettings.rate = val;
            if (voiceRateValue) voiceRateValue.textContent = val.toFixed(1);
            localStorage.setItem(getStorageKey("voice_rate"), val.toString());
        });
    }

    if (voicePitchInput) {
        voicePitchInput.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            voiceSettings.pitch = val;
            if (voicePitchValue) voicePitchValue.textContent = val.toFixed(1);
            localStorage.setItem(getStorageKey("voice_pitch"), val.toString());
        });
    }

    if (voiceVolumeInput) {
        voiceVolumeInput.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            voiceSettings.volume = val;
            if (voiceVolumeValue) voiceVolumeValue.textContent = val.toFixed(1);
            localStorage.setItem(getStorageKey("voice_volume"), val.toString());
        });
    }

    if (voiceSelect) {
        voiceSelect.addEventListener("change", (e) => {
            voiceSettings.voiceName = e.target.value;
            localStorage.setItem(getStorageKey("voice_name"), e.target.value);
        });
    }

    // --- BROWSER VOICES LOADING & CATEGORIZATION ---
    function categorizeVoice(voice) {
        const name = (voice.name || "").toLowerCase();
        if (name.includes("female") || name.includes("zira") || name.includes("samantha") || name.includes("victoria") || name.includes("karen") || name.includes("fiona") || name.includes("moira") || name.includes("veena") || name.includes("aria") || name.includes("jenny")) {
            return "female";
        }
        if (name.includes("male") || name.includes("david") || name.includes("mark") || name.includes("alex") || name.includes("george") || name.includes("richard") || name.includes("ravi") || name.includes("guy") || name.includes("stefan")) {
            return "male";
        }
        return "other";
    }

    function loadAvailableVoices() {
        if (!('speechSynthesis' in window)) return;

        availableVoices = window.speechSynthesis.getVoices() || [];
        if (!voiceSelect) return;

        voiceSelect.innerHTML = `<option value="">Default System Voice</option>`;

        const femaleGroup = document.createElement("optgroup");
        femaleGroup.label = "Female Voices";

        const maleGroup = document.createElement("optgroup");
        maleGroup.label = "Male Voices";

        const otherGroup = document.createElement("optgroup");
        otherGroup.label = "Other / System Voices";

        availableVoices.forEach(v => {
            const opt = document.createElement("option");
            opt.value = v.name;
            opt.textContent = `${v.name} (${v.lang})`;
            if (v.name === voiceSettings.voiceName) {
                opt.selected = true;
            }

            const cat = categorizeVoice(v);
            if (cat === "female") {
                femaleGroup.appendChild(opt);
            } else if (cat === "male") {
                maleGroup.appendChild(opt);
            } else {
                otherGroup.appendChild(opt);
            }
        });

        if (femaleGroup.children.length > 0) voiceSelect.appendChild(femaleGroup);
        if (maleGroup.children.length > 0) voiceSelect.appendChild(maleGroup);
        if (otherGroup.children.length > 0) voiceSelect.appendChild(otherGroup);
    }

    if ('speechSynthesis' in window) {
        loadAvailableVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = loadAvailableVoices;
        }
    }

    // QUICK VOICE PROFILE PRESET PILLS
    const voiceProfilePills = document.querySelectorAll(".voice-profile-pill");
    voiceProfilePills.forEach(pill => {
        pill.addEventListener("click", () => {
            const profile = pill.getAttribute("data-profile");
            voiceProfilePills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");

            if (profile === "system") {
                voiceSettings.voiceName = "";
                voiceSettings.rate = 1.0;
                voiceSettings.pitch = 1.0;
                voiceSettings.volume = 1.0;
                if (voiceSelect) voiceSelect.value = "";
                showToast("Applied System Voice profile", "info");
            } else if (profile === "female") {
                const femaleVoice = availableVoices.find(v => categorizeVoice(v) === "female");
                if (femaleVoice) {
                    voiceSettings.voiceName = femaleVoice.name;
                    if (voiceSelect) voiceSelect.value = femaleVoice.name;
                    showToast(`Applied Female Voice: ${femaleVoice.name}`, "info");
                } else {
                    showToast("No explicit female voice found. Using system default.", "info");
                }
            } else if (profile === "male") {
                const maleVoice = availableVoices.find(v => categorizeVoice(v) === "male");
                if (maleVoice) {
                    voiceSettings.voiceName = maleVoice.name;
                    if (voiceSelect) voiceSelect.value = maleVoice.name;
                    showToast(`Applied Male Voice: ${maleVoice.name}`, "info");
                } else {
                    showToast("No explicit male voice found. Using system default.", "info");
                }
            }

            if (voiceRateInput) {
                voiceRateInput.value = voiceSettings.rate;
                if (voiceRateValue) voiceRateValue.textContent = voiceSettings.rate.toFixed(1);
            }
            if (voicePitchInput) {
                voicePitchInput.value = voiceSettings.pitch;
                if (voicePitchValue) voicePitchValue.textContent = voiceSettings.pitch.toFixed(1);
            }
            if (voiceVolumeInput) {
                voiceVolumeInput.value = voiceSettings.volume;
                if (voiceVolumeValue) voiceVolumeValue.textContent = voiceSettings.volume.toFixed(1);
            }

            localStorage.setItem(getStorageKey("voice_name"), voiceSettings.voiceName);
            localStorage.setItem(getStorageKey("voice_rate"), voiceSettings.rate.toString());
            localStorage.setItem(getStorageKey("voice_pitch"), voiceSettings.pitch.toString());
            localStorage.setItem(getStorageKey("voice_volume"), voiceSettings.volume.toString());
        });
    });

    // --- TEXT TO SPEECH ENGINE (TTS) ---
    function cleanTextForSpeech(rawText) {
        if (!rawText) return "";
        let clean = rawText;
        // Remove code blocks
        clean = clean.replace(/```[\s\S]*?```/g, " code snippet omitted ");
        // Remove inline code
        clean = clean.replace(/`([^`]+)`/g, "$1");
        // Remove markdown headings & formatting
        clean = clean.replace(/^###?\s+/gm, "");
        clean = clean.replace(/\*\*(.*?)\*\*/g, "$1");
        clean = clean.replace(/\*([^\*]+)\*/g, "$1");
        clean = clean.replace(/\[(.*?)\]\(.*?\)/g, "$1");
        // Clean multiple newlines/spaces
        clean = clean.replace(/[\n\r]+/g, ". ").replace(/\s+/g, " ").trim();
        return clean;
    }

    function speakResponse(rawText, onEndCallback = null) {
        if (!('speechSynthesis' in window)) {
            showToast("Text-to-speech isn't supported in this browser.", "error");
            return;
        }

        stopSpeaking();

        const textToSpeak = cleanTextForSpeech(rawText);
        if (!textToSpeak) return;

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = voiceSettings.rate;
        utterance.pitch = voiceSettings.pitch;
        utterance.volume = voiceSettings.volume;

        // Select Voice
        if (availableVoices.length === 0) {
            availableVoices = window.speechSynthesis.getVoices() || [];
        }

        if (/[\u0900-\u097F]/.test(textToSpeak) || (voiceSettings.recLanguage || "").startsWith("hi")) {
            utterance.lang = "hi-IN";
            if (!voiceSettings.voiceName) {
                const hiVoice = availableVoices.find(v => v.lang.toLowerCase().startsWith("hi") || v.name.toLowerCase().includes("hindi") || v.name.toLowerCase().includes("hi-in"));
                if (hiVoice) utterance.voice = hiVoice;
            }
        }

        if (!utterance.voice && voiceSettings.voiceName) {
            const chosen = availableVoices.find(v => v.name === voiceSettings.voiceName);
            if (chosen) utterance.voice = chosen;
        } else if (!utterance.voice) {
            // Auto select natural English or selected language voice if possible
            const langCode = voiceSettings.recLanguage || "en-US";
            const matchLang = availableVoices.find(v => v.lang.toLowerCase().startsWith(langCode.substring(0, 2).toLowerCase()));
            if (matchLang) utterance.voice = matchLang;
        }

        utterance.onstart = () => {
            isSpeaking = true;
            setAssistantStatus("speaking");
            if (topStopSpeakBtn) topStopSpeakBtn.style.display = "inline-flex";
        };

        utterance.onend = () => {
            isSpeaking = false;
            setAssistantStatus("idle");
            if (topStopSpeakBtn) topStopSpeakBtn.style.display = "none";
            if (onEndCallback && typeof onEndCallback === "function") {
                onEndCallback();
            }
        };

        utterance.onerror = (err) => {
            console.warn("Speech synthesis error:", err);
            isSpeaking = false;
            setAssistantStatus("idle");
            if (topStopSpeakBtn) topStopSpeakBtn.style.display = "none";
        };

        window.speechSynthesis.speak(utterance);
    }

    function stopSpeaking() {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        isSpeaking = false;
        setAssistantStatus("idle");
        if (topStopSpeakBtn) topStopSpeakBtn.style.display = "none";
    }

    if (topStopSpeakBtn) {
        topStopSpeakBtn.addEventListener("click", () => {
            stopSpeaking();
            showToast("Speech stopped", "info");
        });
    }

    if (testVoiceBtn) {
        testVoiceBtn.addEventListener("click", () => {
            const isHindi = (voiceSettings.recLanguage || "").startsWith("hi");
            const testMsg = isHindi
                ? "नमस्ते। मैं JARVIS हूँ, आपका व्यक्तिगत AI assistant."
                : "Hello. I am JARVIS, your personal AI assistant.";
            speakResponse(testMsg);
        });
    }

    // --- SPEECH TO TEXT ENGINE (STT) ---
    const micBtn = document.getElementById("micBtn");
    const chatInput = document.getElementById("chatInput");

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SpeechRec();
        speechRecognition.continuous = false;
        speechRecognition.interimResults = false;
        speechRecognition.lang = voiceSettings.recLanguage;

        speechRecognition.onstart = () => {
            isListening = true;
            setAssistantStatus("listening");
            if (micBtn) {
                micBtn.classList.add("listening");
                micBtn.title = "Listening... Click to stop listening";
                micBtn.setAttribute("aria-label", "Stop listening");
            }
        };

        speechRecognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            if (chatInput && transcript) {
                chatInput.value = (chatInput.value ? chatInput.value + " " + transcript : transcript).trim();
                autoResizeInput();
            }

            // Auto-submit if Hands-Free Mode is ON
            if (voiceSettings.handsFree === "on" && chatForm && chatInput.value.trim()) {
                setTimeout(() => {
                    chatForm.requestSubmit();
                }, 300);
            }
        };

        speechRecognition.onerror = (e) => {
            console.warn("Speech recognition error:", e.error);
            stopListening();

            let errorMsg = "Speech recognition encountered an error.";
            if (e.error === "not-allowed" || e.error === "permission-denied") {
                errorMsg = "Microphone permission denied. Please allow microphone access in browser settings.";
            } else if (e.error === "no-speech") {
                errorMsg = "No speech detected. Please try speaking again.";
            } else if (e.error === "network") {
                errorMsg = "Speech recognition network error.";
            }

            showToast(errorMsg, "error");
        };

        speechRecognition.onend = () => {
            stopListening();
        };

        if (micBtn) {
            micBtn.addEventListener("click", () => {
                stopSpeaking();
                if (isListening) {
                    speechRecognition.stop();
                } else {
                    speechRecognition.lang = voiceSettings.recLanguage;
                    try {
                        speechRecognition.start();
                    } catch (err) {
                        console.warn("Speech recognition start failed:", err);
                        stopListening();
                    }
                }
            });
        }
    } else if (micBtn) {
        micBtn.addEventListener("click", () => {
            showToast("Voice input is not supported in this browser. Please try Chrome or Edge.", "error");
        });
    }

    function stopListening() {
        isListening = false;
        if (micBtn) {
            micBtn.classList.remove("listening");
            micBtn.title = "Use Voice Input (Speech-to-Text)";
            micBtn.setAttribute("aria-label", "Start voice input");
        }
        if (!isProcessing && !isSpeaking) {
            setAssistantStatus("idle");
        }
    }

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
        stopSpeaking();
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
        stopSpeaking();
        activeChatId = chatId;
        saveChatsToStorage();
        renderSidebarChats();
        renderActiveChat();
        switchView("chatView");
    }

    function renderActiveChat() {
        const activeChat = chats.find(c => c.id === activeChatId);
        if (!activeChat) return;

        const viewTitle = document.getElementById("viewTitle");
        if (viewTitle) {
            viewTitle.textContent = activeChat.title === "New Conversation" ? "Chat" : activeChat.title;
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
                    const viewTitle = document.getElementById("viewTitle");
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
            stopSpeaking();
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
            stopSpeaking();
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

    const viewTitles = {
        chatView: "Chat",
        summarizeView: "Email Summarizer",
        developerView: "Developer Mode",
        notesView: "Notes & Task Assistant",
        historyView: "Conversation History",
        settingsView: "JARVIS Settings",
        documentsView: "Document Assistant",
        webSearchView: "Web Search"
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
        stopSpeaking();
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

        const viewTitle = document.getElementById("viewTitle");
        if (viewId === "chatView") {
            const activeChat = chats.find(c => c.id === activeChatId);
            if (viewTitle) {
                viewTitle.textContent = (activeChat && activeChat.title !== "New Conversation") ? activeChat.title : "Chat";
            }
        } else if (viewTitles[viewId]) {
            if (viewTitle) viewTitle.textContent = viewTitles[viewId];
        }

        if (viewId === "historyView") renderHistoryView();
        if (viewId === "notesView") loadNotes();
        if (viewId === "documentsView") loadUserDocuments();
        if (viewId === "webSearchView") {
            const searchInput = document.getElementById("webSearchInput");
            if (searchInput) searchInput.focus();
        }
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

    // --- CHAT SUBMISSION & AI RESPONSE ---
    if (chatForm) {
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const userText = chatInput.value.trim();
            if (!userText || isProcessing) return;

            sendMessage(userText);
        });
    }

    async function sendMessage(text) {
        stopSpeaking();
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
            const viewTitle = document.getElementById("viewTitle");
            if (viewTitle) viewTitle.textContent = titleText;
        }

        activeChat.updatedAt = new Date().toISOString();
        saveChatsToStorage();
        renderSidebarChats();

        chatInput.value = "";
        chatInput.style.height = "auto";

        setProcessing(true);
        setAssistantStatus("thinking");
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

                setAssistantStatus("idle");

                // Auto speak if Voice Responses is ON
                if (voiceSettings.responses === "on") {
                    speakResponse(data.answer, () => {
                        // If Hands-Free Mode is also ON, automatically start listening after speech finishes!
                        if (voiceSettings.handsFree === "on" && speechRecognition && !isListening) {
                            setTimeout(() => {
                                try { speechRecognition.start(); } catch (e) {}
                            }, 500);
                        }
                    });
                }
            } else {
                setAssistantStatus("idle");
                const errorMsg = data.error || "Something went wrong while contacting JARVIS. Please try again.";
                appendMessageUI({ role: "assistant", text: `⚠️ ${errorMsg}`, isError: true, time: getCurrentTime() });
            }
        } catch (err) {
            console.error("Fetch error:", err);
            showTypingIndicator(false);
            setAssistantStatus("idle");
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

            // Copy Action Button
            const copyBtn = document.createElement("button");
            copyBtn.classList.add("action-chip");
            copyBtn.setAttribute("aria-label", "Copy message");
            copyBtn.textContent = "📋 Copy";
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(msg.text);
                copyBtn.textContent = "✓ Copied";
                showToast("Copied to clipboard", "success");
                setTimeout(() => copyBtn.textContent = "📋 Copy", 2000);
            });

            // Regenerate Action Button
            const regenBtn = document.createElement("button");
            regenBtn.classList.add("action-chip");
            regenBtn.setAttribute("aria-label", "Regenerate response");
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

            // Speak Action Button
            const speakBtn = document.createElement("button");
            speakBtn.classList.add("action-chip", "speak-btn");
            speakBtn.setAttribute("aria-label", "Speak response aloud");
            speakBtn.innerHTML = `🔊 Speak`;
            speakBtn.addEventListener("click", () => {
                speakResponse(msg.text);
            });

            // Stop Action Button
            const stopBtn = document.createElement("button");
            stopBtn.classList.add("action-chip", "stop-btn");
            stopBtn.setAttribute("aria-label", "Stop speaking");
            stopBtn.innerHTML = `■ Stop`;
            stopBtn.addEventListener("click", () => {
                stopSpeaking();
            });

            actions.appendChild(copyBtn);
            actions.appendChild(regenBtn);
            actions.appendChild(speakBtn);
            actions.appendChild(stopBtn);
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
                stopSpeaking();
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

    // --- FEATURE 1: DOCUMENTS MANAGEMENT & DOCUMENT CHAT ---
    let userDocuments = [];
    let activeDocumentId = null;

    const docFileInput = document.getElementById("docFileInput");
    const triggerUploadBtn = document.getElementById("triggerUploadBtn");
    const uploadDropzone = document.getElementById("uploadDropzone");
    const documentsGrid = document.getElementById("documentsGrid");
    const docCountBadge = document.getElementById("docCountBadge");
    const docChatContainer = document.getElementById("docChatContainer");
    const activeDocName = document.getElementById("activeDocName");
    const closeDocChatBtn = document.getElementById("closeDocChatBtn");
    const docChatForm = document.getElementById("docChatForm");
    const docChatInput = document.getElementById("docChatInput");
    const docMessageList = document.getElementById("docMessageList");
    const docMicBtn = document.getElementById("docMicBtn");

    function formatFileSize(bytes) {
        if (!bytes) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }

    async function loadUserDocuments() {
        if (!documentsGrid) return;
        try {
            const res = await fetch("/api/documents");
            if (res.ok) {
                const data = await res.json();
                userDocuments = data.documents || [];
                renderDocumentsGrid();
            } else {
                showToast("Failed to load documents", "error");
            }
        } catch (e) {
            console.error("Error loading documents:", e);
        }
    }

    function renderDocumentsGrid() {
        if (!documentsGrid) return;

        if (docCountBadge) {
            docCountBadge.textContent = `${userDocuments.length} Document${userDocuments.length === 1 ? '' : 's'}`;
        }

        if (userDocuments.length === 0) {
            documentsGrid.innerHTML = `
                <div class="doc-empty-state">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <p>No documents uploaded yet. Upload a PDF, TXT, or DOCX document above to start asking questions!</p>
                </div>
            `;
            return;
        }

        documentsGrid.innerHTML = "";
        userDocuments.forEach(doc => {
            const card = document.createElement("div");
            card.className = `doc-card ${doc.id === activeDocumentId ? 'active-doc' : ''}`;

            const fileExt = (doc.file_type || "DOC").toUpperCase();
            const formattedSize = formatFileSize(doc.file_size);

            card.innerHTML = `
                <div class="doc-card-header">
                    <div class="doc-icon-badge">${escapeHtml(fileExt)}</div>
                    <div class="doc-info">
                        <h4 title="${escapeHtml(doc.original_filename)}">${escapeHtml(doc.original_filename)}</h4>
                        <p>${formattedSize} &bull; ${escapeHtml(doc.uploaded_at || 'Recently')}</p>
                    </div>
                </div>
                <div class="doc-card-actions">
                    <button type="button" class="btn primary-btn sm ask-doc-btn" style="flex:1;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        <span>Ask JARVIS</span>
                    </button>
                    <button type="button" class="btn danger-btn sm delete-doc-btn" title="Delete Document">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;

            card.querySelector(".ask-doc-btn").addEventListener("click", () => {
                openDocChat(doc);
            });

            card.querySelector(".delete-doc-btn").addEventListener("click", (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${doc.original_filename}"?`)) {
                    deleteDocument(doc.id);
                }
            });

            documentsGrid.appendChild(card);
        });
    }

    if (triggerUploadBtn && docFileInput) {
        triggerUploadBtn.addEventListener("click", () => docFileInput.click());
    }

    if (uploadDropzone && docFileInput) {
        uploadDropzone.addEventListener("click", (e) => {
            if (e.target !== triggerUploadBtn && !triggerUploadBtn.contains(e.target)) {
                docFileInput.click();
            }
        });
    }

    if (docFileInput) {
        docFileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const allowed = ["pdf", "txt", "docx"];
            const ext = file.name.split('.').pop().toLowerCase();

            if (!allowed.includes(ext)) {
                showToast("Unsupported file format. Please select a PDF, TXT, or DOCX file.", "error");
                docFileInput.value = "";
                return;
            }

            if (file.size > 10 * 1024 * 1024) {
                showToast("File size exceeds 10MB limit.", "error");
                docFileInput.value = "";
                return;
            }

            const formData = new FormData();
            formData.append("file", file);

            showToast("Uploading and processing document...", "info");

            try {
                const res = await fetch("/api/documents/upload", {
                    method: "POST",
                    body: formData
                });

                const data = await res.json();
                if (res.ok) {
                    showToast("Document uploaded successfully!", "success");
                    docFileInput.value = "";
                    await loadUserDocuments();
                    if (data.document) {
                        openDocChat(data.document);
                    }
                } else {
                    showToast(data.error || "Failed to upload document", "error");
                }
            } catch (err) {
                console.error("Document upload error:", err);
                showToast("Network error uploading document.", "error");
            } finally {
                docFileInput.value = "";
            }
        });
    }

    async function deleteDocument(docId) {
        try {
            const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
            if (res.ok) {
                showToast("Document deleted", "info");
                if (activeDocumentId === docId) {
                    closeDocChat();
                }
                await loadUserDocuments();
            } else {
                const data = await res.json();
                showToast(data.error || "Failed to delete document", "error");
            }
        } catch (e) {
            console.error("Error deleting doc:", e);
        }
    }

    const activeDocMeta = document.getElementById("activeDocMeta");

    function openDocChat(doc) {
        activeDocumentId = doc.id;
        if (activeDocName) activeDocName.textContent = doc.original_filename;
        if (activeDocMeta) {
            const ext = (doc.file_type || "DOC").toUpperCase();
            const sizeStr = formatFileSize(doc.file_size);
            activeDocMeta.textContent = `${ext} • ${sizeStr}`;
        }
        if (docChatContainer) docChatContainer.style.display = "flex";
        if (docMessageList) {
            docMessageList.innerHTML = "";
            appendDocChatMessage("assistant", `I have loaded **${doc.original_filename}**. Ask me any question about this document!`);
        }
        renderDocumentsGrid();
        if (docChatInput) {
            docChatInput.style.height = "auto";
            docChatInput.focus();
        }
    }

    function closeDocChat() {
        activeDocumentId = null;
        if (docChatContainer) docChatContainer.style.display = "none";
        renderDocumentsGrid();
    }

    if (closeDocChatBtn) {
        closeDocChatBtn.addEventListener("click", closeDocChat);
    }

    if (docChatInput) {
        docChatInput.addEventListener("input", () => {
            docChatInput.style.height = "auto";
            docChatInput.style.height = Math.min(docChatInput.scrollHeight, 160) + "px";
        });

        docChatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (docChatForm && docChatInput.value.trim()) {
                    docChatForm.requestSubmit();
                }
            }
        });
    }

    if (docChatForm) {
        docChatForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!activeDocumentId || !docChatInput) return;

            const question = docChatInput.value.trim();
            if (!question) return;

            stopSpeaking();
            appendDocChatMessage("user", question);
            docChatInput.value = "";
            docChatInput.style.height = "auto";

            setAssistantStatus("thinking");

            const loadingGroup = appendDocChatMessage("assistant", "Analyzing document...", false, true);

            try {
                const res = await fetch(`/api/documents/${activeDocumentId}/ask`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ question: question })
                });

                const data = await res.json();
                setAssistantStatus("idle");

                if (res.ok && data.answer) {
                    updateDocAssistantMessage(loadingGroup, data.answer);
                    if (voiceSettings.responses === "on") {
                        speakResponse(data.answer);
                    }
                } else {
                    updateDocAssistantMessage(loadingGroup, `⚠️ ${data.error || "Failed to process question."}`, true);
                }
            } catch (err) {
                setAssistantStatus("idle");
                console.error("Error asking doc:", err);
                updateDocAssistantMessage(loadingGroup, "⚠️ Network connection error analyzing document.", true);
            }
        });
    }

    function appendDocChatMessage(role, text, isError = false, isLoading = false) {
        if (!docMessageList) return;

        const group = document.createElement("div");
        group.classList.add("message-group", role);
        if (isError) group.classList.add("error-message");

        const bubble = document.createElement("div");
        bubble.classList.add("message-bubble");

        if (role === "user") {
            bubble.textContent = text;
            group.appendChild(bubble);
        } else {
            bubble.innerHTML = renderMarkdown(text);
            group.appendChild(bubble);

            if (!isLoading) {
                const actions = document.createElement("div");
                actions.classList.add("message-actions");

                const copyBtn = document.createElement("button");
                copyBtn.classList.add("action-chip");
                copyBtn.textContent = "📋 Copy";
                copyBtn.addEventListener("click", () => {
                    navigator.clipboard.writeText(text);
                    copyBtn.textContent = "✓ Copied";
                    showToast("Copied to clipboard", "success");
                    setTimeout(() => copyBtn.textContent = "📋 Copy", 2000);
                });

                const speakBtn = document.createElement("button");
                speakBtn.classList.add("action-chip", "speak-btn");
                speakBtn.textContent = "🔊 Speak";
                speakBtn.addEventListener("click", () => {
                    speakResponse(text);
                });

                actions.appendChild(copyBtn);
                actions.appendChild(speakBtn);
                group.appendChild(actions);
            }
        }

        docMessageList.appendChild(group);
        docMessageList.scrollTop = docMessageList.scrollHeight;
        return group;
    }

    function updateDocAssistantMessage(group, text, isError = false) {
        if (!group) return;
        if (isError) group.classList.add("error-message");

        const bubble = group.querySelector(".message-bubble");
        if (bubble) {
            bubble.innerHTML = renderMarkdown(text);
        }

        let actions = group.querySelector(".message-actions");
        if (!actions) {
            actions = document.createElement("div");
            actions.classList.add("message-actions");

            const copyBtn = document.createElement("button");
            copyBtn.classList.add("action-chip");
            copyBtn.textContent = "📋 Copy";
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(text);
                copyBtn.textContent = "✓ Copied";
                showToast("Copied to clipboard", "success");
                setTimeout(() => copyBtn.textContent = "📋 Copy", 2000);
            });

            const speakBtn = document.createElement("button");
            speakBtn.classList.add("action-chip", "speak-btn");
            speakBtn.textContent = "🔊 Speak";
            speakBtn.addEventListener("click", () => {
                speakResponse(text);
            });

            actions.appendChild(copyBtn);
            actions.appendChild(speakBtn);
            group.appendChild(actions);
        }

        if (docMessageList) {
            docMessageList.scrollTop = docMessageList.scrollHeight;
        }
    }

    if (docMicBtn && speechRecognition) {
        docMicBtn.addEventListener("click", () => {
            stopSpeaking();
            if (isListening) {
                speechRecognition.stop();
            } else {
                speechRecognition.onresult = (e) => {
                    const transcript = e.results[0][0].transcript;
                    if (docChatInput && transcript) {
                        docChatInput.value = transcript;
                        docChatInput.style.height = "auto";
                        docChatInput.style.height = Math.min(docChatInput.scrollHeight, 160) + "px";
                    }
                };
                speechRecognition.start();
            }
        });
    }


    // --- FEATURE 2: REAL WEB SEARCH (CONVERSATIONAL CHAT ENGINE) ---
    const webSearchForm = document.getElementById("webSearchForm");
    const webSearchInput = document.getElementById("webSearchInput");
    const webMessageList = document.getElementById("webMessageList");
    const webMicBtn = document.getElementById("webMicBtn");

    if (webSearchInput) {
        webSearchInput.addEventListener("input", () => {
            webSearchInput.style.height = "auto";
            webSearchInput.style.height = Math.min(webSearchInput.scrollHeight, 160) + "px";
        });

        webSearchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (webSearchForm && webSearchInput.value.trim()) {
                    webSearchForm.requestSubmit();
                }
            }
        });
    }

    if (webSearchForm) {
        webSearchForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!webSearchInput) return;

            const query = webSearchInput.value.trim();
            if (!query) return;

            stopSpeaking();
            appendWebChatMessage("user", query);
            webSearchInput.value = "";
            webSearchInput.style.height = "auto";

            setAssistantStatus("thinking");
            const loadingGroup = appendWebChatMessage("assistant", "🔎 Searching the web...", [], false, true);

            try {
                const res = await fetch("/api/web-search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query: query })
                });

                const data = await res.json();
                setAssistantStatus("idle");

                if (res.ok && data.answer) {
                    updateWebAssistantMessage(loadingGroup, data.answer, data.results || []);
                    if (voiceSettings.responses === "on") {
                        speakResponse(data.answer);
                    }
                } else {
                    updateWebAssistantMessage(loadingGroup, `⚠️ ${data.error || "Web search request failed."}`, [], true);
                }
            } catch (err) {
                setAssistantStatus("idle");
                console.error("Web search error:", err);
                updateWebAssistantMessage(loadingGroup, "⚠️ Network connection error performing web search.", [], true);
            }
        });
    }

    function appendWebChatMessage(role, text, sources = [], isError = false, isLoading = false) {
        if (!webMessageList) return;

        const welcomeCard = webMessageList.querySelector(".web-search-welcome");
        if (welcomeCard) welcomeCard.style.display = "none";

        const group = document.createElement("div");
        group.classList.add("message-group", role);
        if (isError) group.classList.add("error-message");

        const bubble = document.createElement("div");
        bubble.classList.add("message-bubble");

        if (role === "user") {
            bubble.textContent = text;
            group.appendChild(bubble);
        } else {
            bubble.innerHTML = renderMarkdown(text);
            
            if (sources && sources.length > 0) {
                const sourcesDiv = document.createElement("div");
                sourcesDiv.classList.add("web-sources-attached");
                
                let sourcesHTML = `<div class="web-sources-attached-header">Attached Sources (${sources.length})</div><div class="web-sources-attached-grid">`;
                sources.forEach(src => {
                    sourcesHTML += `
                        <div class="source-card">
                            <div>
                                <span class="source-domain-badge">${escapeHtml(src.domain || 'WEB')}</span>
                                <h4 class="source-card-title">${escapeHtml(src.title)}</h4>
                                <p class="source-card-snippet">${escapeHtml(src.snippet)}</p>
                            </div>
                            ${src.url ? `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" class="btn secondary-btn sm source-open-btn">
                                <span>Open Source</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </a>` : ''}
                        </div>
                    `;
                });
                sourcesHTML += `</div>`;
                sourcesDiv.innerHTML = sourcesHTML;
                bubble.appendChild(sourcesDiv);
            }

            group.appendChild(bubble);

            if (!isLoading) {
                const actions = document.createElement("div");
                actions.classList.add("message-actions");

                const copyBtn = document.createElement("button");
                copyBtn.classList.add("action-chip");
                copyBtn.textContent = "📋 Copy";
                copyBtn.addEventListener("click", () => {
                    navigator.clipboard.writeText(text);
                    copyBtn.textContent = "✓ Copied";
                    showToast("Copied to clipboard", "success");
                    setTimeout(() => copyBtn.textContent = "📋 Copy", 2000);
                });

                const speakBtn = document.createElement("button");
                speakBtn.classList.add("action-chip", "speak-btn");
                speakBtn.textContent = "🔊 Speak";
                speakBtn.addEventListener("click", () => {
                    speakResponse(text);
                });

                actions.appendChild(copyBtn);
                actions.appendChild(speakBtn);
                group.appendChild(actions);
            }
        }

        const time = document.createElement("div");
        time.classList.add("message-time");
        time.textContent = getCurrentTime();
        group.appendChild(time);

        webMessageList.appendChild(group);
        
        const wrapper = document.querySelector(".web-search-message-list-wrapper");
        if (wrapper) {
            wrapper.scrollTop = wrapper.scrollHeight;
        }
        return group;
    }

    function updateWebAssistantMessage(group, text, sources = [], isError = false) {
        if (!group) return;
        if (isError) group.classList.add("error-message");

        const bubble = group.querySelector(".message-bubble");
        if (bubble) {
            bubble.innerHTML = renderMarkdown(text);

            if (sources && sources.length > 0) {
                const sourcesDiv = document.createElement("div");
                sourcesDiv.classList.add("web-sources-attached");
                
                let sourcesHTML = `<div class="web-sources-attached-header">Attached Sources (${sources.length})</div><div class="web-sources-attached-grid">`;
                sources.forEach(src => {
                    sourcesHTML += `
                        <div class="source-card">
                            <div>
                                <span class="source-domain-badge">${escapeHtml(src.domain || 'WEB')}</span>
                                <h4 class="source-card-title">${escapeHtml(src.title)}</h4>
                                <p class="source-card-snippet">${escapeHtml(src.snippet)}</p>
                            </div>
                            ${src.url ? `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" class="btn secondary-btn sm source-open-btn">
                                <span>Open Source</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </a>` : ''}
                        </div>
                    `;
                });
                sourcesHTML += `</div>`;
                sourcesDiv.innerHTML = sourcesHTML;
                bubble.appendChild(sourcesDiv);
            }
        }

        let actions = group.querySelector(".message-actions");
        if (!actions) {
            actions = document.createElement("div");
            actions.classList.add("message-actions");

            const copyBtn = document.createElement("button");
            copyBtn.classList.add("action-chip");
            copyBtn.textContent = "📋 Copy";
            copyBtn.addEventListener("click", () => {
                navigator.clipboard.writeText(text);
                copyBtn.textContent = "✓ Copied";
                showToast("Copied to clipboard", "success");
                setTimeout(() => copyBtn.textContent = "📋 Copy", 2000);
            });

            const speakBtn = document.createElement("button");
            speakBtn.classList.add("action-chip", "speak-btn");
            speakBtn.textContent = "🔊 Speak";
            speakBtn.addEventListener("click", () => {
                speakResponse(text);
            });

            actions.appendChild(copyBtn);
            actions.appendChild(speakBtn);
            group.appendChild(actions);
        }

        const wrapper = document.querySelector(".web-search-message-list-wrapper");
        if (wrapper) {
            wrapper.scrollTop = wrapper.scrollHeight;
        }
    }

    if (webMicBtn && speechRecognition) {
        webMicBtn.addEventListener("click", () => {
            stopSpeaking();
            if (isListening) {
                speechRecognition.stop();
            } else {
                speechRecognition.onresult = (e) => {
                    const transcript = e.results[0][0].transcript;
                    if (webSearchInput && transcript) {
                        webSearchInput.value = transcript;
                        webSearchInput.style.height = "auto";
                        webSearchInput.style.height = Math.min(webSearchInput.scrollHeight, 160) + "px";
                        if (voiceSettings.handsFree === "on" && webSearchForm) {
                            setTimeout(() => webSearchForm.requestSubmit(), 300);
                        }
                    }
                };
                speechRecognition.start();
            }
        });
    }
});
