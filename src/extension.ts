import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const provider = new ChatViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
    );

    let disposable = vscode.commands.registerCommand('vscode-llm-chat.openChat', () => {
        vscode.commands.executeCommand('workbench.view.extension.llm-chat-sidebar');
    });

    context.subscriptions.push(disposable);
}

class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'llm-chat.chatView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'sendMessage':
                    await this.handleChatMessage(message.text);
                    break;
                case 'getSelectedCode':
                    this.getSelectedCode();
                    break;
            }
        });
    }

    private async handleChatMessage(message: string) {
        const config = vscode.workspace.getConfiguration('llmChat');
        const endpoint = config.get<string>('endpoint');
        const apiKey = config.get<string>('apiKey');

        try {
            const response = await fetch(endpoint!, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();
            this._view?.webview.postMessage({ 
                type: 'response', 
                text: data.response 
            });
        } catch (error) {
            vscode.window.showErrorMessage('Failed to communicate with LLM service');
        }
    }

    private getSelectedCode() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selection = editor.selection;
            const text = editor.document.getText(selection);
            this._view?.webview.postMessage({ 
                type: 'selectedCode', 
                text,
                fileName: editor.document.fileName
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>LLM Chat</title>
                <style>
                    body {
                        padding: 10px;
                    }
                    #chat-container {
                        display: flex;
                        flex-direction: column;
                        height: calc(100vh - 20px);
                    }
                    #messages {
                        flex: 1;
                        overflow-y: auto;
                        margin-bottom: 10px;
                        border: 1px solid var(--vscode-input-border);
                        padding: 10px;
                    }
                    .message {
                        margin-bottom: 10px;
                        padding: 5px;
                        border-radius: 5px;
                    }
                    .user-message {
                        background-color: var(--vscode-editor-background);
                    }
                    .bot-message {
                        background-color: var(--vscode-editor-inactiveSelectionBackground);
                    }
                    .code-context {
                        background-color: var(--vscode-textBlockQuote-background);
                        padding: 5px;
                        margin: 5px 0;
                        font-family: monospace;
                    }
                    #input-container {
                        display: flex;
                        gap: 5px;
                    }
                    #message-input {
                        flex: 1;
                        padding: 5px;
                    }
                </style>
            </head>
            <body>
                <div id="chat-container">
                    <div id="messages"></div>
                    <div id="input-container">
                        <input type="text" id="message-input" placeholder="Type your message...">
                        <button id="send-button">Send</button>
                        <button id="add-code-button">Add Code</button>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const messagesContainer = document.getElementById('messages');
                    const messageInput = document.getElementById('message-input');
                    const sendButton = document.getElementById('send-button');
                    const addCodeButton = document.getElementById('add-code-button');
                    
                    let selectedCode = '';
                    
                    function addMessage(text, isUser = false, isCode = false) {
                        const messageDiv = document.createElement('div');
                        messageDiv.className = \`message \${isUser ? 'user-message' : 'bot-message'}\`;
                        if (isCode) {
                            messageDiv.className = 'code-context';
                        }
                        messageDiv.textContent = text;
                        messagesContainer.appendChild(messageDiv);
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    }
                    
                    sendButton.addEventListener('click', () => {
                        const message = messageInput.value;
                        if (message) {
                            addMessage(message, true);
                            vscode.postMessage({
                                command: 'sendMessage',
                                text: message
                            });
                            messageInput.value = '';
                        }
                    });
                    
                    messageInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            sendButton.click();
                        }
                    });
                    
                    addCodeButton.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'getSelectedCode'
                        });
                    });
                    
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'response':
                                addMessage(message.text);
                                break;
                            case 'selectedCode':
                                if (message.text) {
                                    addMessage(\`Selected code from \${message.fileName}:\n\${message.text}\`, false, true);
                                    selectedCode = message.text;
                                }
                                break;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}

export function deactivate() {}