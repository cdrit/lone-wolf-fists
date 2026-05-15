import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { sanitiseAndBreak } from '../helpers/strings.mjs';
import { LWFTECHNIQUES } from '../helpers/technique-config.mjs';
import { LWFSKILLS } from '../helpers/skills.mjs';
import { LWFWEAPONTAGS } from '../helpers/weapon-tags.mjs';
import { LWFARTIFACTS } from '../helpers/artifact-config.mjs';
import { LWFABILITIES } from '../helpers/abilities.mjs';
import { LWFNODES, productList } from '../helpers/nodes.mjs';
import { LWFIMBALANCES } from '../helpers/imbalance-config.mjs';

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const LWFItemSheetBase = HandlebarsApplicationMixin(ItemSheetV2);

export class lwfItemSheet extends LWFItemSheetBase {
  static DEFAULT_OPTIONS = {
    classes: ['lone-wolf-fists', 'lwf-item-app'],
    position: { width: 400, height: 600 },
    window: { resizable: true },
    form: {
      closeOnSubmit: false,
      submitOnChange: true,
      handler: async function(event, form, formData) {
        return this._onSubmit(event, form, formData);
      },
    },
    actions: {
      create: function(event, target) { return this._onEffectControl(event, target); },
      toggle: function(event, target) { return this._onEffectControl(event, target); },
      edit: function(event, target) { return this._onEffectControl(event, target); },
      delete: function(event, target) { return this._onEffectControl(event, target); },
      toggleEditMode: function(event, target) { return this._onToggleEditMode(event, target); },
    },
  };

  static PARTS = {
    form: { template: '' },
  };

  static DEFAULT_TABS = {
    artifact: 'core',
    form: 'overview',
    technique: 'overview',
    weapon: 'overview',
  };

  tabGroups = { primary: this.constructor.DEFAULT_TABS[this.item.type] ?? 'description' };

  /** @override */
  get template() {
    const path = 'systems/lone-wolf-fists/templates/item';
    // Return a single sheet for all item types.
    // return `${path}/item-sheet.hbs`;

    // Alternatively, you could use the following return statement to do a
    // unique item sheet by type, like `weapon-sheet.hbs`.
    return `${path}/item-${this.item.type}-sheet.hbs`;
  }

  /* -------------------------------------------- */

  /** @override */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.form.template = this.template;
    return parts;
  }

  /** @override */
  async _prepareContext(options) {
    // Retrieve base data structure.
    const context = await super._prepareContext(options);

    // Use a safe clone of the item data for further operations.
    const itemData = this.document.toPlainObject();

    // Enrich description info for display
    // Enrichment turns text like `[[/r 1d20]]` into buttons
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.item.system.description,
      {
        // Whether to show secret blocks in the finished html
        secrets: this.document.isOwner,
        // Data to fill in for inline rolls
        rollData: this.item.getRollData(),
        // Relative UUID resolution
        relativeTo: this.item,
      }
    );

    // Add the item's data to context.data for easier access, as well as flags.
    context.item = this.item;
    context.document = this.document;
    context.system = itemData.system;
    context.flags = itemData.flags;
    context.cssClass = [this.isEditable ? 'editable' : 'locked', this.item.type].join(' ');

    // Adding a pointer to CONFIG.LWF
    context.config = CONFIG.LWF;

    // Prepare active effects for easier access
    context.effects = prepareActiveEffectCategories(this.item.effects);

    if (itemData.type === "technique" || itemData.type === "artifact"){
      context.techType = LWFTECHNIQUES.techType;
      context.techLvl = LWFTECHNIQUES.techLvl;
      context.skills = LWFSKILLS;
      context.techEffect = sanitiseAndBreak(context.system.techEffect);
    }

    if(itemData.type === "weapon" || itemData.type === "artifact"){
      context.tagsCore = LWFWEAPONTAGS.core;
      context.tagsExtra = LWFWEAPONTAGS.extra;
    }

    if(itemData.type === "artifact"){
      context.artifactType = LWFARTIFACTS.type;
      context.artifactTier = LWFARTIFACTS.tier;
      context.artifactTags = LWFARTIFACTS.tag;
      context.artifactDescription = sanitiseAndBreak(context.system.artifactDescription);
    }

    if(itemData.type === "ability") {
      context.abilityType = LWFABILITIES.types;
    }

    if(itemData.type === 'anatomy') {
      let onslaughtName;
      const onslaughts = this.item.parent?.items?.filter(i => (i.type === 'ability'));
      const linkedOnslaught = onslaughts?.find(o => (o._id === context.system.linkedOnslaught));
      if(linkedOnslaught === undefined)
        onslaughtName = "None";
      else {
        onslaughtName = linkedOnslaught.name;
      }
      context.onslaughtName = onslaughtName;
      context.onslaughts = onslaughts;
    }

    if(itemData.type === 'node') {
      context.nodeType = LWFNODES.nodeType;
      context.richness = LWFNODES.richness;
      context.developmentLevel = LWFNODES.developmentLevel;
      const territory = this.item.parent?.system?.territory;
      context.territory = territory;
      productList(context);
    }
    
    if(itemData.type === 'imbalance') {
      context.imbalanceSources = LWFIMBALANCES.source;
      context.bodyParts = LWFIMBALANCES.bodyPart;
      context.imbalanceStats = LWFIMBALANCES.stat;
      if(context.item.isEmbedded)
        context.embedded = true;
    }

    context.isGM = game.user.isGM;
    context.duration = LWFABILITIES.durations;
    context.editable = this.isEditable;

    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._activateSheetTabs();
    this._activateImagePicker();
    this.activateListeners($(this.element));
  }

  /**
   * Activate tabbed navigation for item sheets.
   *
   * The item templates keep the tab group on the nav element, so mirror the
   * actor-sheet compatibility shim here as well.
   */
  _activateSheetTabs() {
    const root = this.element;
    if (!root) return;

    for (const nav of root.querySelectorAll('.tabs[data-group]')) {
      const group = nav.dataset.group;
      const tabs = nav.querySelectorAll('[data-tab]');
      if (!group || !tabs.length) continue;

      const activateTab = (tabId) => {
        this.tabGroups[group] = tabId;
        for (const tab of tabs) {
          tab.classList.toggle('active', tab.dataset.tab === tabId);
        }
        for (const panel of root.querySelectorAll(`.tab[data-group="${group}"]`)) {
          panel.classList.toggle('active', panel.dataset.tab === tabId);
        }
      };

      activateTab(this.tabGroups[group] ?? tabs[0].dataset.tab);

      nav.onclick = (event) => {
        const tab = event.target.closest('[data-tab]');
        if (!tab || !nav.contains(tab)) return;

        event.preventDefault();
        const tabId = tab.dataset.tab;
        try {
          this.changeTab(tabId, group, { event, navElement: tab, updatePosition: true });
        } catch (_err) {
          this.tabGroups[group] = tabId;
        }
        activateTab(this.tabGroups[group] ?? tabId);
      };
    }
  }

  _activateImagePicker() {
    const root = this.element;
    if (!root || !this.isEditable) return;

    for (const image of root.querySelectorAll('[data-edit="img"]')) {
      image.setAttribute('role', 'button');
      image.setAttribute('tabindex', '0');
      image.onclick = (event) => this._onEditImage(event);
      image.onkeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        this._onEditImage(event);
      };
    }
  }

  _onEditImage(event) {
    event.preventDefault();
    const picker = new FilePicker({
      type: 'image',
      current: this.item.img,
      callback: (path) => this.item.update({ img: path })
    });
    return picker.browse(this.item.img);
  }

  async _onSubmit(event, form, formData) {
    const updateData = foundry.utils.expandObject(formData.object);
    return this.document.update(updateData);
  }

  /* -------------------------------------------- */

  _getActionTarget(event, target) {
    return target ?? event.currentTarget;
  }

  _isEditableAction(event) {
    event.preventDefault();
    return this.isEditable;
  }

  _onEffectControl(event, target) {
    if (!this._isEditableAction(event)) return;
    const effectEvent = Object.create(event);
    Object.defineProperty(effectEvent, 'currentTarget', { value: this._getActionTarget(event, target) });
    onManageActiveEffect(effectEvent, this.item);
  }

  _onToggleEditMode(event) {
    if (!this._isEditableAction(event)) return;
    const editMode = !this.item.system.editMode
    this.item.update({[ 'system.editMode' ]: editMode})
  }

  /** @override */
  activateListeners(html) {

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Roll handlers, click handlers, etc. would go here.


    // Standard named form controls are submitted by ApplicationV2.
    // Avoid a parallel manual item-choice updater here; it caused typed values
    // to be overwritten during rerenders on item sheets.



    // Leaving this here as an example of creating an active effect
    /*html.on('change', '#armorValue', async (ev) => {
      
      let toDelete = Array.from(this.item.effects);
      // Check to see if the effect is currently disabed, and make the new effect disabled if it is
      // This assumes that there is only one effect
      let isDisabled = toDelete[0]?.disabled;
      if(isDisabled === undefined)
        isDisabled = true;

      for(let i in toDelete){
        this.item.deleteEmbeddedDocuments('ActiveEffect', [`${toDelete[i]._id}`])
      }

      this.item.createEmbeddedDocuments('ActiveEffect', [{
        name: "setArmor",
        origin: this.item.uuid,
        disabled: false,
        changes: [{
          key: "system.armor",
          mode: 2,
          lvl: ev.currentTarget.value,
          }]
        }]
      );
    })*/
  }
}
