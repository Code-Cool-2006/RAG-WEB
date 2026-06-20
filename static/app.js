document.addEventListener('DOMContentLoaded', () => {
    // DOM Cache
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadStatus = document.getElementById('upload-status');
    const documentList = document.getElementById('document-list');
    const docCountBadge = document.getElementById('doc-count');
    const ingestBtn = document.getElementById('ingest-btn');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const clearDocsBtn = document.getElementById('clear-docs-btn');

    const API_BASE = window.location.protocol === 'file:' ? 'http://127.0.0.1:8000' : '';

    // State Variables
    let isUploading = false;
    let isIngesting = false;
    let isQuerying = false;

    // Load initial documents
    fetchDocuments();

    // ==========================================================================
    // File Drag & Drop + Upload
    // ==========================================================================
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFilesUpload(files);
    });

    // Handle click to browse
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        handleFilesUpload(fileInput.files);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    async function handleFilesUpload(files) {
        if (files.length === 0 || isUploading) return;

        isUploading = true;
        
        // Render upload loading state in the drop zone
        const originalDropZoneHTML = dropZone.innerHTML;
        const fileNames = Array.from(files).map(f => f.name).join(', ');
        dropZone.innerHTML = `
            <i class="fa-solid fa-circle-notch fa-spin upload-icon" style="color: var(--accent-cyan);"></i>
            <p style="color: var(--accent-cyan); font-weight: 600;">Uploading ${files.length} file(s)...</p>
            <span style="font-size: 0.75rem; color: var(--text-muted); max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block;">
                ${fileNames}
            </span>
        `;
        dropZone.style.pointerEvents = 'none'; // disable clicks during upload

        showStatus(`Uploading: ${fileNames}`, 'info');

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        try {
            const response = await fetch(`${API_BASE}/api/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (response.ok && result.success) {
                showStatus(`Successfully uploaded ${result.uploaded.length} file(s).`, 'success');
                await fetchDocuments();
                // Automatically index the newly uploaded files!
                ingestBtn.click();
            } else {
                showStatus(result.detail || 'Failed to upload files.', 'error');
            }
        } catch (error) {
            console.error(error);
            showStatus('Error uploading files. Make sure server is running.', 'error');
        } finally {
            isUploading = false;
            fileInput.value = ''; // Reset input
            dropZone.innerHTML = originalDropZoneHTML;
            dropZone.style.pointerEvents = 'auto'; // re-enable clicks
        }
    }


    function showStatus(text, type) {
        uploadStatus.textContent = text;
        uploadStatus.className = 'status-msg ' + type;
        setTimeout(() => {
            if (uploadStatus.textContent === text) {
                uploadStatus.textContent = '';
                uploadStatus.className = 'status-msg';
            }
        }, 5000);
    }

    // ==========================================================================
    // Fetch and Render Documents
    // ==========================================================================
    async function fetchDocuments() {
        try {
            const response = await fetch(`${API_BASE}/api/documents`);
            if (response.ok) {
                const data = await response.json();
                renderDocuments(data.documents);
            }
        } catch (error) {
            console.error('Error fetching documents:', error);
        }
    }

    function renderDocuments(documents) {
        docCountBadge.textContent = documents.length;
        if (documents.length === 0) {
            documentList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>No documents uploaded yet</p>
                </div>
            `;
            return;
        }

        documentList.innerHTML = documents.map(doc => {
            const sizeKB = (doc.size / 1024).toFixed(1);
            let iconClass = 'fa-file-lines';
            if (doc.name.endsWith('.pdf')) iconClass = 'fa-file-pdf';
            if (doc.name.endsWith('.md')) iconClass = 'fa-file-code';

            return `
                <li class="document-item">
                    <i class="fa-solid ${iconClass}"></i>
                    <span class="doc-name" title="${doc.name}">${doc.name}</span>
                    <span class="doc-size">${sizeKB} KB</span>
                </li>
            `;
        }).join('');
    }

    // ==========================================================================
    // Trigger Ingestion / Re-indexing
    // ==========================================================================
    ingestBtn.addEventListener('click', async () => {
        if (isIngesting) return;

        isIngesting = true;
        const btnText = ingestBtn.querySelector('.btn-text');
        const btnSpinner = ingestBtn.querySelector('.btn-spinner');

        btnText.style.display = 'none';
        btnSpinner.style.display = 'inline-block';
        ingestBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/api/ingest`, {
                method: 'POST'
            });
            const result = await response.json();
            if (response.ok && result.success) {
                showStatus(`Indexing complete. ${result.count} documents processed.`, 'success');
                // Create a brief system alert in chat if conversation is active
                appendMessage('system', `Index successfully updated! Processed ${result.count} documents.`);
            } else {
                showStatus(result.detail || 'Ingestion failed.', 'error');
            }
        } catch (error) {
            console.error(error);
            showStatus('Error triggering ingestion.', 'error');
        } finally {
            isIngesting = false;
            btnText.style.display = 'inline-block';
            btnSpinner.style.display = 'none';
            ingestBtn.disabled = false;
        }
    });

    // Clear all documents and database collection
    clearDocsBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to clear all uploaded documents and reset the database?')) return;
        
        try {
            const response = await fetch(`${API_BASE}/api/documents/clear`, {
                method: 'POST'
            });
            const result = await response.json();
            if (response.ok && result.success) {
                showStatus('All documents and indexes cleared.', 'success');
                fetchDocuments();
                clearChatBtn.click(); // Reset chat
            } else {
                showStatus(result.detail || 'Failed to clear documents.', 'error');
            }
        } catch (error) {
            console.error(error);
            showStatus('Error clearing documents.', 'error');
        }
    });

    // ==========================================================================
    // Chat System & Grounded Query Engine
    // ==========================================================================
    
    // Clear chat
    clearChatBtn.addEventListener('click', () => {
        chatOutput.innerHTML = `
            <div class="welcome-card">
                <div class="bot-avatar"><i class="fa-solid fa-robot"></i></div>
                <h2>Welcome to your Personal Knowledge Engine</h2>
                <p>Ask anything. Your answers will be drawn exclusively from the notes you upload on the left panel, preventing model hallucinations.</p>
                <div class="getting-started">
                    <h3>Try asking:</h3>
                    <ul>
                        <li>"What is Prim's algorithm?"</li>
                        <li>"What did I write about Kruskal's algorithm?"</li>
                        <li>"Summarize my notes."</li>
                    </ul>
                </div>
            </div>
        `;
        bindWelcomeSuggestions();
    });

    // Bind suggestion click events
    function bindWelcomeSuggestions() {
        const suggestions = document.querySelectorAll('.getting-started li');
        suggestions.forEach(item => {
            item.addEventListener('click', () => {
                chatInput.value = item.textContent.replace(/"/g, '');
                chatInput.focus();
            });
        });
    }

    bindWelcomeSuggestions();

    // Submit question
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = chatInput.value.trim();
        if (!question || isQuerying) return;

        // Clear input and remove welcome card
        chatInput.value = '';
        const welcomeCard = chatOutput.querySelector('.welcome-card');
        if (welcomeCard) welcomeCard.remove();

        // Append User Message
        appendMessage('user', question);
        isQuerying = true;

        // Append loading bubble
        const loadingId = appendLoadingBubble();
        chatOutput.scrollTop = chatOutput.scrollHeight;

        try {
            const response = await fetch(`${API_BASE}/api/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question })
            });

            // Remove loading bubble
            document.getElementById(loadingId).remove();

            if (response.ok) {
                const data = await response.json();
                appendMessage('bot', data.answer, data.sources);
            } else {
                const errData = await response.json();
                appendMessage('bot', `⚠️ Error calling query API: ${errData.detail || 'Internal server error'}`);
            }
        } catch (error) {
            console.error(error);
            document.getElementById(loadingId).remove();
            appendMessage('bot', '⚠️ Connection failed. Could not communicate with server.');
        } finally {
            isQuerying = false;
            chatOutput.scrollTop = chatOutput.scrollHeight;
        }
    });

    function appendMessage(sender, text, sources = []) {
        const messageRow = document.createElement('div');
        messageRow.className = `message-row ${sender}-msg`;

        let bubbleHtml = `<div class="message-bubble">`;
        
        if (sender === 'system') {
            bubbleHtml = `<div class="message-bubble" style="background-color: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.25); text-align: center; max-width: 100%; font-size: 0.8rem; padding: 0.5rem 1rem;">`;
        }

        // Handle line breaks and bold formatting in the text (basic parser)
        let formattedText = text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');

        bubbleHtml += `<p>${formattedText}</p>`;

        // Append sources if present
        if (sources && sources.length > 0) {
            const collapseId = 'collapse-' + Math.random().toString(36).substr(2, 9);
            bubbleHtml += `
                <div class="sources-container">
                    <button class="sources-toggle" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'flex' : 'none'">
                        <i class="fa-solid fa-circle-info"></i> View Sources (${sources.length})
                    </button>
                    <ul class="sources-list" style="display: none;">
                        ${sources.map(src => `
                            <li class="source-item">
                                <div class="source-meta">
                                    <span class="source-name">${src.file_name}</span>
                                    <span class="source-score">Relevance: ${src.score.toFixed(3)}</span>
                                </div>
                                <span class="source-text">${src.text}</span>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        bubbleHtml += `</div>`;
        messageRow.innerHTML = bubbleHtml;
        chatOutput.appendChild(messageRow);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    function appendLoadingBubble() {
        const id = 'loading-' + Date.now();
        const messageRow = document.createElement('div');
        messageRow.className = 'message-row bot-msg';
        messageRow.id = id;
        messageRow.innerHTML = `
            <div class="message-bubble">
                <div class="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;
        chatOutput.appendChild(messageRow);
        return id;
    }
});
