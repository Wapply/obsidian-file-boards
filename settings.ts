import { PluginSettingTab, App, Setting } from "obsidian";
import CardBoardPlugin from "./main";

export interface CardBoardPluginSettings {
    openNoteInNewTab: boolean;
    cardWidth: number;  // Add back cardWidth
    cardHeight: number; // Add back cardHeight
  }

  export const DEFAULT_SETTINGS: CardBoardPluginSettings = {
    openNoteInNewTab: false,
    cardWidth: 200,  // Default card width
    cardHeight: 200, // Default card height
  };

export class CardBoardSettingTab extends PluginSettingTab {
  plugin: CardBoardPlugin;

  constructor(app: App, plugin: CardBoardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "CardBoard Plugin Settings" });

    new Setting(containerEl)
      .setName("Open Note in New Tab")
      .setDesc("Open notes in a new tab when clicked")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.openNoteInNewTab)
          .onChange(async (value) => {
            this.plugin.settings.openNoteInNewTab = value;
            await this.plugin.saveSettings();
            // No need to refresh the view here
          })
      ); 
  }
}