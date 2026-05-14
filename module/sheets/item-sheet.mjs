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
    classes: ['lone-wolf-fists', 'sheet', 'item'],
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

  tabGroups = { primary: 'description' };

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
    this.activateListeners($(this.element));
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


    // Change imbalance data when the data is altered on the sheet
    html.on('change', '.item-choice', async (ev) =>{      
      const tr = $(ev.currentTarget).parents('.sheet')[0].id;
      const id = tr.substring(tr.indexOf('-') + 1).replaceAll('-', '.');
      
      const item = fromUuidSync(id);
      
      // The following if statement is used to detect if the chosen element is selected or not
      // If there is a better way to do this, lmk
      let update;
      if(ev.currentTarget.type === "checkbox")
        update = $(ev.currentTarget).prop('checked');
      else if (ev.currentTarget.nodeName !== "SELECT")
        update = ev.currentTarget.value;
      else
        update = $(ev.currentTarget).find(":selected")[0].value;
      const target = ev.currentTarget.dataset.techstat;
      await item.update({ [`system.${target}`]: update});
    });


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
