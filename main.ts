import { App, ItemView, Modal, Plugin, TFile, Vault, WorkspaceLeaf, TFolder } from 'obsidian';
import { CardBoardSettingTab, CardBoardPluginSettings, DEFAULT_SETTINGS } from "./settings";

export default class CardBoardPlugin extends Plugin {
  settings: CardBoardPluginSettings;
  view: CardBoardView;

  async onload() {
    console.log('Loading CardBoard Plugin');

    await this.loadSettings();
    this.addSettingTab(new CardBoardSettingTab(this.app, this));

    this.addRibbonIcon('blocks', 'CardBoard', () => this.openCardBoard());

    this.addCommand({
      id: 'open-card-board',
      name: 'Open Card Board',
      callback: () => this.openCardBoard(),
    });

    this.registerView(
      'card-board-view',
      (leaf) => {
        this.view = new CardBoardView(leaf, this.app.vault, this); // Pass "this" (the plugin instance)
        return this.view;
      }
    );

    this.app.workspace.onLayoutReady(() => this.activateView());
  }

  async openCardBoard() {
    this.activateView();
  }

  activateView() {
    this.app.workspace.detachLeavesOfType('card-board-view');
    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (rightLeaf) {
      rightLeaf.setViewState({ type: 'card-board-view' });
    }
  }

  onunload() {
    this.app.workspace.detachLeavesOfType('card-board-view');
    console.log('Unloading CardBoard Plugin');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class CardBoardView extends ItemView {
  private vault: Vault;
  private folderStack: TFolder[];
  private plugin: CardBoardPlugin; // Add the plugin property

  constructor(leaf: WorkspaceLeaf, vault: Vault, plugin: CardBoardPlugin) { // Add plugin to constructor
    super(leaf);
    this.vault = vault;
    this.folderStack = [this.vault.getRoot()];
    this.plugin = plugin; // Assign the plugin instance
  }

  getViewType(): string {
    return 'card-board-view';
  }

  getDisplayText(): string {
    return 'Card Board';
  }

  async onOpen() {
    await this.renderView();
  }

  async renderView() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.classList.add('board-container');

    await this.createFolderView(this.folderStack[this.folderStack.length - 1], container);
  }

  async createFolderView(folder: TFolder, parent: HTMLElement) {
    const folderContainer = parent.createDiv({ cls: 'folder-container' });
    const folderHeader = folderContainer.createDiv({ cls: 'folder-header' });

    if (this.folderStack.length > 1) {
      const backButton = folderHeader.createEl('button', { cls: 'back-button', text: '←' });
      backButton.addEventListener('click', () => {
        this.folderStack.pop();
        this.renderView();
      });
    }

    folderHeader.createSpan({ text: folder.name });

    const notesContainer = folderContainer.createDiv({ cls: 'notes-container' });

    const folders = folder.children.filter((child): child is TFolder => child instanceof TFolder);
    const notes = folder.children.filter((child): child is TFile => child instanceof TFile && child.extension === 'md');

    for (const folder of folders) {
      notesContainer.appendChild(this.createFolderCard(folder));
    }

    for (const note of notes) {
      notesContainer.appendChild(await this.createCard(note));
    }
  }

  createFolderCard(folder: TFolder): HTMLElement {
    const card = createDiv({ cls: ['card', 'folder-card'] });
  
    // Display folder name directly:
    const titleContainer = card.createDiv({ cls: 'folder-title' });
    titleContainer.textContent = folder.name;
  
    card.addEventListener('click', () => {
      this.folderStack.push(folder);
      this.renderView();
    });
    return card;
  }

  async createCard(file: TFile): Promise<HTMLElement> {
    const card = createDiv({ 
      cls: 'card',
      attr: {
        style: `width: ${this.plugin.settings.cardWidth}px; height: ${this.plugin.settings.cardHeight}px;` 
      }
    });

    // Add a container for the note title
    const titleContainer = card.createDiv({ cls: 'card-title' });
    titleContainer.textContent = file.basename; 

    const thumb = await this.getThumbnail(file);
    if (thumb) {
      card.appendChild(thumb); // Append the thumbnail element (image or video)
    } else {
      card.textContent = file.basename;
    }

    card.addEventListener('click', () => {
      const filePath = file.path;
  
      if (this.plugin.settings.openNoteInNewTab) {
        this.app.workspace.openLinkText(filePath, '', true, { active: true }); // New tab
      } else {  
        this.app.workspace.openLinkText(filePath, '', false); // Same tab (changed to false)
      }
    });

    const configButton = card.createEl('button', { cls: 'config-button', text: '⚙' });
    configButton.addEventListener('click', (e) => {
      e.stopPropagation();
      new NoteConfigModal(this.app, file, this).open();
    });

    return card;
  }

  async getThumbnail(file: TFile): Promise<HTMLElement | null> {
    const content = await this.vault.cachedRead(file);
  
    // Updated regex to include video extensions:
    const imageRegex = /!\[\[(.*?)\]\]|!\[(.*?)\]\(([^)]*)\)/g;
    let match;
    while ((match = imageRegex.exec(content)) !== null) {
      let filePath = match[1] || match[3];
  
      if (filePath.startsWith('file:///')) {
        filePath = decodeURI(filePath)
          .replace(/^file:\/{2,3}/, '')
          .replace(/\\/g, '/');
      }
  
      // Check if it's an image or video:
      if (/\.(jpg|jpeg|png|gif|bmp|mp4|webm)$/i.test(filePath)) { 
        const fileLink = this.app.metadataCache.getFirstLinkpathDest(filePath, file.path);
        if (fileLink) {
          const resourcePath = this.vault.adapter.getResourcePath(fileLink.path);
  
          // Create an image or video element:
          if (/\.(jpg|jpeg|png|gif|bmp)$/i.test(filePath)) {
            const img = createEl("img");
            img.src = resourcePath;
            return img;
          } else { // Video
            const video = createEl("video");
            video.src = resourcePath;
            video.controls = true; // Add video controls 
            video.muted = true;     // Mute by default
            video.style.width = "100%";
            video.style.height = "auto";
            return video;
          }
        }
      }
    }
    return null;
  }

  async onClose() {
    // Clean up if needed
  }
}

class NoteConfigModal extends Modal {
    private file: TFile;
    private imagePaths: string[];
    private currentImageIndex: number;
    private cardBoardView: CardBoardView;
  
    constructor(app: App, file: TFile, cardBoardView: CardBoardView) {
      super(app);
      this.file = file;
      this.imagePaths = [];
      this.currentImageIndex = 0;
      this.cardBoardView = cardBoardView;
    }
  
    async onOpen() {
      await this.loadImages();
      this.displayImage();
    }
  
    async loadImages() {
        const content = await this.app.vault.cachedRead(this.file);
        const imageRegex = /!\[\[(.*?)\]\]|!\[(.*?)\]\(([^)]*)\)/g;
        let match;
        while ((match = imageRegex.exec(content)) !== null) {
          let imagePath = match[1] || match[3];
      
          // Specific check for file URLs:
          if (imagePath.startsWith('file:///')) {
            imagePath = decodeURI(imagePath)
                         .replace(/^file:\/{2,3}/, '')
                         .replace(/\\/g, '/'); // Replace backslashes
          }
      
          if (imagePath && /\.(jpg|jpeg|png|gif|bmp)$/.test(imagePath)) {
            this.imagePaths.push(imagePath);
          }
        }
      }

    displayImage() {
        this.contentEl.empty();
    
        if (this.imagePaths.length > 0) {
          const imagePath = this.imagePaths[this.currentImageIndex];
          const fileLink = this.app.metadataCache.getFirstLinkpathDest(imagePath, this.file.path);
    
          if (fileLink) {
            const imgSrc = this.app.vault.adapter.getResourcePath(fileLink.path);
            
            // Create a container for the image to control its size
            const imgContainer = this.contentEl.createDiv({ cls: 'image-container' }); 
            const img = imgContainer.createEl('img', { attr: { src: imgSrc } });

            // Buttons Container
            const buttonsContainer = this.contentEl.createDiv({ cls: 'buttons-container' });
    
            // Previous Button
            const prevButton = buttonsContainer.createEl('button', { cls: 'nav-button prev-button', text: '‹' }); // Use arrow icon
            prevButton.addEventListener('click', () => {
              this.currentImageIndex = (this.currentImageIndex - 1 + this.imagePaths.length) % this.imagePaths.length;
              this.displayImage();
            });
    
            // Next Button
            const nextButton = buttonsContainer.createEl('button', { cls: 'nav-button next-button', text: '›' }); // Use arrow icon
            nextButton.addEventListener('click', () => {
              this.currentImageIndex = (this.currentImageIndex + 1) % this.imagePaths.length;
              this.displayImage();
            });
    
            // Set Thumbnail Button 
            const setThumbnailButton = this.contentEl.createEl('button', { 
                cls: 'set-button', 
                text: 'Set as Thumbnail' 
              });
              setThumbnailButton.addEventListener('click', async () => {
              await this.setThumbnail(this.imagePaths[this.currentImageIndex]); 
              this.close(); // Close the modal after setting
            });
          }
        } else {
          this.contentEl.setText('No images found in this note.');
        }
      }

      async setThumbnail(imagePath: string) {
        let newContent = await this.app.vault.read(this.file);
    
        // 1. Remove the selected image link from the content
        const imageRegex = new RegExp(`!\\[\\[${imagePath}\\]\\]|!\\[.*?\\]\\(${imagePath}\\)`, 'g');
        newContent = newContent.replace(imageRegex, '');
    
        // 2. Add the selected image link to the beginning of the content
        //    Use the correct format based on whether it's a file URL or not:
        if (imagePath.startsWith('file:///')) {
          newContent = `![ ](${imagePath})\n\n${newContent}`;  // Markdown link for file URL
        } else {
          newContent = `![[${imagePath}]]\n\n${newContent}`;  // Wikilink for regular paths
        }
    
        // 3. Write the updated content back to the file
        await this.app.vault.modify(this.file, newContent);
    
        // 4. Refresh CardBoardView
        this.cardBoardView.renderView();
        this.close(); // Close the modal
      }

  onClose() {
    this.contentEl.empty();
  }
}