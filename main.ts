import { App, ItemView, Modal, Plugin, TFile, Vault, WorkspaceLeaf, TFolder } from 'obsidian';

export default class CardBoardPlugin extends Plugin {
    async onload() {
        console.log('Loading CardBoard Plugin');

        this.addRibbonIcon('blocks', 'CardBoard', () => {
            this.openCardBoard();
        });

        this.addCommand({
            id: 'open-card-board',
            name: 'Open Card Board',
            callback: () => this.openCardBoard(),
        });

        this.registerView(
            'card-board-view',
            (leaf) => new CardBoardView(leaf, this.app.vault)
        );

        this.app.workspace.onLayoutReady(() => {
            if (this.app.workspace.getLeavesOfType('card-board-view').length) {
                this.app.workspace.revealLeaf(
                    this.app.workspace.getLeavesOfType('card-board-view')[0]
                );
            } else {
                const rightLeaf = this.app.workspace.getRightLeaf(false);
                if (rightLeaf) {
                    rightLeaf.setViewState({
                        type: 'card-board-view',
                    });
                }
            }
        });
    }

    async openCardBoard() {
        this.app.workspace.detachLeavesOfType('card-board-view');

        const rightLeaf = this.app.workspace.getRightLeaf(false);
        if (rightLeaf) {
            await rightLeaf.setViewState({
                type: 'card-board-view',
            });

            this.app.workspace.revealLeaf(
                this.app.workspace.getLeavesOfType('card-board-view')[0]
            );
        }
    }

    onunload() {
        this.app.workspace.detachLeavesOfType('card-board-view');
        console.log('Unloading CardBoard Plugin');
    }
}

class CardBoardView extends ItemView {
    private vault: Vault;
    private folderStack: TFolder[];

    constructor(leaf: WorkspaceLeaf, vault: Vault) {
        super(leaf);
        this.vault = vault;
        this.folderStack = [this.vault.getRoot()]; // Start at the root folder
    }

    getViewType(): string {
        return 'card-board-view';
    }

    getDisplayText(): string {
        return 'Card Board';
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();

        const boardContainer = document.createElement('div');
        boardContainer.classList.add('board-container');

        await this.createFolderView(this.folderStack[this.folderStack.length - 1], boardContainer);

        container.appendChild(boardContainer);
    }

    async createFolderView(folder: TFolder, parent: HTMLElement) {
        const folderContainer = document.createElement('div');
        folderContainer.classList.add('folder-container');

        const folderHeader = document.createElement('div');
        folderHeader.classList.add('folder-header');

        // Create back button if not in root folder
        if (this.folderStack.length > 1) {
            const backButton = document.createElement('button');
            backButton.classList.add('back-button');
            backButton.textContent = '← Back';
            backButton.addEventListener('click', () => {
                this.folderStack.pop();
                this.onOpen();
            });
            folderHeader.appendChild(backButton);
        }

        folderHeader.appendChild(document.createTextNode(folder.name));

        folderContainer.appendChild(folderHeader);

        const notesContainer = document.createElement('div');
        notesContainer.classList.add('notes-container');

        for (const child of folder.children) {
            if (child instanceof TFolder) {
                const folderCard = this.createFolderCard(child);
                notesContainer.appendChild(folderCard);
            } else if (child instanceof TFile && child.extension === 'md') {
                const card = await this.createCard(child);
                notesContainer.appendChild(card);
            }
        }

        folderContainer.appendChild(notesContainer);
        parent.appendChild(folderContainer);
    }

    createFolderCard(folder: TFolder): HTMLElement {
        const card = document.createElement('div');
        card.classList.add('card', 'folder-card');
        card.textContent = folder.name;

        card.addEventListener('click', () => {
            this.folderStack.push(folder);
            this.onOpen();
        });

        return card;
    }

    async createCard(file: TFile): Promise<HTMLElement> {
        const card = document.createElement('div');
        card.classList.add('card');

        const thumb = await this.getThumbnail(file);
        if (thumb) {
            const img = document.createElement('img');
            img.src = thumb;
            card.appendChild(img);
        } else {
            card.textContent = file.basename;
        }

        card.addEventListener('click', async () => {
            const filePath = file.path;
            this.app.workspace.openLinkText(filePath, '', true);
        });

        const configButton = document.createElement('button');
        configButton.classList.add('config-button');
        configButton.textContent = '⚙';
        configButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            new NoteConfigModal(this.app, file).open();
        });
        card.appendChild(configButton);

        return card;
    }

    async getThumbnail(file: TFile): Promise<string | null> {
        const content = await this.vault.read(file);
        const imageRegex = /!\[.*?\]\((.*?)\)|!\[(.*?)\]/g;
        const matches = [...content.matchAll(imageRegex)];

        if (matches.length > 0) {
            const firstImage = matches[0][1] || matches[0][2];
            const fileLink = this.app.metadataCache.getFirstLinkpathDest(firstImage, file.path);
            return fileLink ? this.vault.adapter.getResourcePath(fileLink.path) : null;
        }
        return null;
    }

    async onClose() {
        // Clean up resources if necessary
    }
}

class NoteConfigModal extends Modal {
    private file: TFile;
    private imagePaths: string[];
    private currentImageIndex: number;

    constructor(app: App, file: TFile) {
        super(app);
        this.file = file;
        this.imagePaths = [];
        this.currentImageIndex = 0;
        this.loadImages();
    }

    async loadImages() {
        const content = await this.app.vault.read(this.file);
        const imageRegex = /!\[.*?\]\((.*?)\)|\!\[(.*?)\]/g;
        const matches = [...content.matchAll(imageRegex)];

        this.imagePaths = matches.map(match => match[1] || match[2]);
        this.updateImage();
    }

    updateImage() {
        if (this.imagePaths.length > 0) {
            const imagePath = this.imagePaths[this.currentImageIndex];
            const fileLink = this.app.metadataCache.getFirstLinkpathDest(imagePath, this.file.path);
            const imgSrc = fileLink ? this.app.vault.adapter.getResourcePath(fileLink.path) : null;
            if (imgSrc) {
                this.contentEl.empty();
                const img = this.contentEl.createEl('img', { attr: { src: imgSrc } });
                this.contentEl.appendChild(img);

                const prevButton = this.contentEl.createEl('button', { text: 'Previous' });
                prevButton.addEventListener('click', () => {
                    this.currentImageIndex = (this.currentImageIndex - 1 + this.imagePaths.length) % this.imagePaths.length;
                    this.updateImage();
                });

                const nextButton = this.contentEl.createEl('button', { text: 'Next' });
                nextButton.addEventListener('click', () => {
                    this.currentImageIndex = (this.currentImageIndex + 1) % this.imagePaths.length;
                    this.updateImage();
                });
            }
        } else {
            this.contentEl.setText('No images found in this note.');
        }
    }

    onOpen() {
        this.updateImage();
    }

    onClose() {
        this.contentEl.empty();
    }
}