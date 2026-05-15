import {
  onManageActiveEffect,
  prepareActiveEffectCategories,
} from '../helpers/effects.mjs';
import { sanitiseAndBreak } from '../helpers/strings.mjs';

import { LWFIMBALANCES } from '../helpers/imbalance-config.mjs';
import { LWFSKILLS } from '../helpers/skills.mjs';
import { LWFTECHNIQUES } from '../helpers/technique-config.mjs';
import { LWFABILITIES } from '../helpers/abilities.mjs';
import { effortRoll } from '../helpers/dice-roll.mjs';
import { chakraReset } from '../helpers/chakra-reset.mjs';
import { productList } from '../helpers/nodes.mjs';
import { LWFDOMAINS } from '../helpers/domains.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { FormDataExtended } = foundry.applications.ux;

const LWFActorSheetBase = HandlebarsApplicationMixin(ActorSheetV2);

/**
 * Extend the basic ActorSheet with some very simple modifications.
 * @extends {ActorSheetV2}
 */
export class lwfActorSheet extends LWFActorSheetBase {
  static DEFAULT_OPTIONS = {
    classes: ['lone-wolf-fists', 'lwf-actor-app'],
    position: { width: 830, height: 800 },
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
      createItem: function(event, target) { return this._onItemCreate(event, target); },
      deleteItem: function(event, target) { return this._onItemDelete(event, target); },
      editItem: function(event, target) { return this._onItemEdit(event, target); },
      chooseMasteries: function(event, target) { return this._onChooseMasteries(event, target); },
      chooseArchetype: function(event, target) { return this._onChooseArchetype(event, target); },
      configureAdvancement: function(event, target) { return this._onConfigureAdvancement(event, target); },
      recoverPrana: function(event, target) { return this._onRecoverPrana(event, target); },
      decreaseChakra: function(event, target) { return this._onDecreaseChakra(event, target); },
      increaseChakra: function(event, target) { return this._onIncreaseChakra(event, target); },
      pranaFlare: function(event, target) { return this._onPranaFlare(event, target); },
      toggleChakra: function(event, target) { return this._onToggleChakra(event, target); },
      rest: function(event, target) { return this._onRest(event, target); },
      roll: function(event, target) { return this._onRoll(event, target); },
      rollEffort: function(event, target) { return this._onEffortRoll(event, target); },
      toggleEditMode: function(event, target) { return this._onToggleEditMode(event, target); },
    },
  };

  static PARTS = {
    form: { template: '' },
  };

  static TABS = {
    primary: {
      initial: 'core',
      tabs: [
        { id: 'core' },
        { id: 'imbalances' },
        { id: 'items' },
        { id: 'followers' },
        { id: 'dharma' },
        { id: 'bio' },
        { id: 'description' },
        { id: 'effects' },
        { id: 'config' },
        { id: 'onslaught' },
        { id: 'military' },
        { id: 'subjects' }
      ]
    }
  };

  tabGroups = { primary: 'core' };

  /** @override */
  get title() {
    return this.actor.name;
  }

  /** @override */
  get template() {
    return `systems/lone-wolf-fists/templates/actor/actor-${this.actor.type}-sheet.hbs`;
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
    // Retrieve the data structure from the base sheet. You can inspect or log
    // the context variable to see the structure, but some key properties for
    // sheets are the actor object, the data object, whether or not it's
    // editable, the items array, and the effects array.
    const context = await super._prepareContext(options);

    // Use a safe clone of the actor data for further operations.
    const actorData = this.document.toPlainObject();

    // Add the actor's data to context.data for easier access, as well as flags.
    context.actor = this.actor;
    context.document = this.document;
    context.items = Array.from(this.actor.items);
    context.system = actorData.system;
    context.flags = actorData.flags;
    context.cssClass = [this.isEditable ? 'editable' : 'locked', this.actor.type].join(' ');

    // Adding a pointer to CONFIG.LWF
    context.config = CONFIG.LWFIMBALANCES;
    context.duration = LWFABILITIES.durations;
    // Prepare character data and items.
    this._prepareItems(context)

    if (actorData.type == 'character' || actorData.type == 'npc') {
      this._prepareCharacterData(context);
      await this._prepareMembers(context);
      context.minChakras = context.system.chakras.lvl
      }

    if(actorData.type == 'disciple') {
      this._prepareDisciple(context);
    }

    if(actorData.type == 'squad') {
      await this._prepareMembers(context);
    }

    if(actorData.type == 'titan') {
      this._prepareTitan(context);
    }

    if(actorData.type === 'platoon') {
      this._preparePlatoon(context);
    }

    if(actorData.type === 'domain') {
      await this._prepareDomain(context);
    }

    if(actorData.type === 'vehicle') {
      this._prepareVehicle(context);
    }
    context.isGM = game.user.isGM;
    context.editable = this.isEditable;

    // Enrich biography info for display
    // Enrichment turns text like `[[/r 1d20]]` into buttons
    context.enrichedBiography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      this.actor.system.biography,
      {
        // Whether to show secret blocks in the finished html
        secrets: this.document.isOwner,
        // Data to fill in for inline rolls
        rollData: this.actor.getRollData(),
        // Relative UUID resolution
        relativeTo: this.actor,
      }
    );


    // Prepare active effects
    context.effects = prepareActiveEffectCategories(
      // A generator that returns all effects stored on the actor
      // as well as any items
      this.actor.allApplicableEffects()
    );

    return context;
  }

  /**
   * Character-specific context modifications
   *
   * @param {object} context The context object to mutate
   */
  _prepareCharacterData(context) {
    // Add data about imbalances to the character sheet
    context.imbalanceSources = LWFIMBALANCES.source;
    context.imbalanceStats = LWFIMBALANCES.stat;
    context.bodyParts = LWFIMBALANCES.bodyPart;
    if (context.clan.length > 0) {
      context.system.deed = context.clan[0].system.deed;
    }
    context.skills = LWFSKILLS;
    context.techType = LWFTECHNIQUES.techType;
    context.techLvl = LWFTECHNIQUES.techLvl;

    let chakraList = Object.keys(context.system.chakras.awakened);
    // Remove either the hell or heaven Chakra
    if(context.system.chakras.hellToggle === true)
      chakraList.splice(1, 1);
    else
      chakraList.splice(0, 1);
    context.chakras = chakraList;

    context.inCombat = context.actor.inCombat;

    return context;
  }

  /**
   * Organize and classify Items for Actor sheets.
   *
   * @param {object} context The context object to mutate
   */
  _prepareItems(context) {
    // Initialize containers.
    const gear = [];
    const weapon = [];
    const armor = [];
    const artifactItems = [];
    let armorValue = 0;
    let bonusPrana = (this.actor.system.prana?.gen.inCombat ? this.actor.system.prana.gen.inCombat: 0);
    const guptKala = [];
    const techniques = {
      "attack": [],
      "defense": [],
      "mudra": [],
      "balance": []
    };
    let hasTechniques = false;
    const form = [];
    const imbalances = [];
    const archetype = [];
    const clan = [];
    const skills = [];
    const ability = {
      "Power": [],
      "Capability": []
    };
    const chargeAttack = [];
    const anatomy = [];
    const node = [];
  


    // Iterate through items, allocating to containers
    for (let i of context.items) {
      function pushToTechnique(item, techArray){
        let type = item.system.techType.toLowerCase();
        techArray[type].push(item);
      }
      function addArmorValue(item, currentArmor){
        if(item.system.worn === true){
          currentArmor += i.system.armorValue;
        }
        return currentArmor;
      }
      i.img = i.img || Item.DEFAULT_ICON;
      // Append to gear.
      switch (i.type) {
        case 'item': 
          gear.push(i);
          break;
        
        case 'armor':
          armorValue = addArmorValue(i, armorValue);
          armor.push(i);
          break;

        case 'weapon':
          weapon.push(i);
          break;

        case 'artifact':
          if(i.system.type === "Weapon")
            weapon.push(i);
          else if(i.system.type === "Armor") {
            armorValue = addArmorValue(i, armorValue);
            armor.push(i);
          }
          else
            artifactItems.push(i);
          if(i.system.hasTechnique) {
            pushToTechnique(i, techniques);
            hasTechniques = true;
          }
          if(i.system.chakra.hasChakra || 
            i.system.chakra.recovery > 0 ||
            (i.system.worn || i.system.held)) {
              bonusPrana += i.system.chakra.recovery;
          }
          break;

        case 'ability':
          if(i.system.subtype === 'Charge Attack')
            chargeAttack.push(i);
          else {
            let type = i.system.subtype;
            ability[type].push(i);
          }
          break;

        case 'technique':
          if(i.system.techLvl === 'form')
            form.push(i);
          else
            pushToTechnique(i, techniques);
          hasTechniques = true;
          break;

        case 'form':
          form.push(i);
          hasTechniques = true;
          break;

        case 'imbalance':
          imbalances.push(i);
          break;

        case 'gupt-kala':
          guptKala.push(i);
          hasTechniques = true;
          break;

        case 'archetype':
          if (archetype.length < 1){
            archetype.push(i);
          }
          else {
            let target = this.actor.items.get(i._id);
            target.delete();
          }
          break;

        case 'clan':
          if (clan.length < 1){
            clan.push(i);
          }
          else {
            let target = this.actor.items.get(i._id);
            target.delete();
          }
          break;

        case 'skill':
          skills.push(i);
          break;

        case 'anatomy':
          anatomy.push(i);
          break;  

        case 'node':
          node.push(i);
          break;    
      }
    }
    // Assign and return
    //TODO: have skills display correctly when using artifact techniques
    context.gear = artifactItems.concat(gear);
    context.weapon = weapon;
    context.armor = armor;
    context.armorValue = armorValue;
    context.bonusPrana = bonusPrana;
    context.artifacts = artifactItems;
    context.guptKala = guptKala;
    context.techniques = techniques;
    context.hasTechniques = hasTechniques;
    context.imbalances = imbalances;
    context.clan = clan;
    context.form = form;
    context.skill = skills;
    context.ability = ability;
    context.anatomy = anatomy;
    context.node = node;
    if(chargeAttack.length > 0)
      context.chargeAttack = chargeAttack;

    if(this.actor.type == 'character')
      this._prepareSkills(context);
    return context;
  }

    /**
   * Further organise skills for Character sheets.
   *
   * @param {object} context The context object to mutate
   */

  /* -------------------------------------------- */

  _prepareSkills(context) {
    let present = [];
    let absent = [];

    // Create a pair of arrays listing the skills the player has mastered (present) and those the player has not (absent)
    // This is to allow for generating the skills list with masteries at the top, and unmastered skills underneath, while retaining the same order of skills
    // TODO: make the datamodel passed to the sheet much simpler
    for(let i in LWFSKILLS) {
      let skill = LWFSKILLS[i].concat(" Mastery");
      let index = context.skill.findIndex((temp) => temp["name"] === skill);
      if(index >= 0) {
        let add = context.skill[index];
        present.push(add);
      }
      else {
        index = context.skill.findIndex((temp) => temp["name"] === LWFSKILLS[i]);
        let add = context.skill[index];
        absent.push(add);
      }
    }
    context.skill.mastered = present;
    context.skill.unmastered = absent; 
    // Work out the difference between the number of masteries they should have, and the number of masteries they do have.
    // If they have fewer masteries than they should, check the masteries compendium, and see which the player doesn't have
    context.skill.difference = this.actor.system.masteries.lvl - present.length;
    if(context.skill.difference > 0){
      context.skill.missing = true;
    }
    return context;
  }

  /**
 * Organise and find data for individual squad members.
 *
 * @param {object} context The context object to mutate
 */
  async _prepareMembers(context) {
    const members = [];
    for(let m of context.system.namedMembers) {
      const member = await fromUuid(m);
      let duplicate = false;
      for(let i = 0; i < members.length; i++) {
        if(members[i].creature === member.name) {
          members[i].quantity += 1;
          duplicate = true;
          break;
        }
      }
      if(duplicate)
        continue;
      const memberData = {
        "img": member.img,
        "creature": member.name,
        "power": member.system.power.lvl,
        "health": member.system.health.lvl,
        "quantity": 1,
        "editable": false,
        "loyalty": member.system.master.loyalty.lvl,
        "id": `${m}`
      }
      members.push(memberData);
    }
    for(let m in context.system.members) {
      let current = context.system.members[m];
      current["editable"] = true;
      current["id"] = m;
      members.push(current);
    }
    if(context.actor.type === 'squad')
      context.isSquad = true;
    context.members = members;
    return context;
  }

  _preparePlatoon(context) {
    const platoonLiving = new Array(context.system.membership.value).fill("");
    const dead = context.system.membership.max - context.system.membership.value;
    const platoonDead = new Array(dead).fill("");
    context.living = platoonLiving;
    context.dead = platoonDead;
    return context;
  }

  _prepareTitan(context) {
    const anatomy = context.anatomy;
    const onslaughts = context.actor.items.filter(i => (i.type === 'ability'));
    const calamity = context.actor.items.get(context.actor.system.calamity);
    const onslaughtIds = onslaughts.map(o => o._id);
    // Checks to see if there is a linked onslaught, and if there is inserts it's name into the linked onslaught box
    // Also toggles it being free so it can be displayed only on the anatomy section
    for(let i in anatomy) {
      let a = anatomy[i];
      const index = onslaughtIds.indexOf(a.system.linkedOnslaught);
      if(index < 0) {
        a.onslaughtName = "None";
        a.onslaughtFrequency = "";
      }
      else {
        a.onslaughtName = onslaughts[index].name;
        a.onslaughtFrequency = onslaughts[index].system.effect.frequency.toString().concat("/",onslaughts[index].system.effect.duration)
      }
    }
    if(calamity === undefined)
      context.calamityDescription = "";
    else
      context.calamityDescription = calamity.system.description;
    context.onslaughts = onslaughts;
    context.calamity = calamity;
    context.anatomy = anatomy;
    return context;
  }

  async _prepareDomain(context) {
    // Go over the node items
    for(let n in context.node) {
      productList(context.node[n])
    }
    const ruler = await fromUuid(context.system.ruler);
    context.ruler = ruler;
    context.forceTypes = LWFDOMAINS.forceTypes;
    return context;
  }

  shortDescription(itemDesc) {
    try {
      let fullStop
      fullStop = itemDesc.indexOf('.');
      if(fullStop >= 0){
        return `${itemDesc.slice(0, fullStop)}...`
      }
      return itemDesc
    }
    catch(err) {
      return ""
    }
  };

  _prepareVehicle(context) {
    const weaponDisplay = []
    const anatomyDisplay = []
    for(let w of context.weapon){
      if(w.system.tag1 != 'Ordnance' && w.system.tag1 != 'Grenade'){
        continue
      }
      const strengthDesc = `Rank ${w.system.strength}`
      w.strengthDesc = strengthDesc;
      const shortDesc = this.shortDescription(w.system.description);
      w.shortDesc = shortDesc;
      weaponDisplay.push(w);
    }
    for(let a of context.anatomy) {
      const shortDesc = this.shortDescription(a.system.description);
      a.shortDesc = shortDesc;
      anatomyDisplay.push(a);
    }
    context.weaponDisplay = weaponDisplay;
    context.anatomyDisplay = anatomyDisplay;
    return context
  };

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this._activateSheetTabs();
    this._activateImagePicker();
    this.activateListeners($(this.element));
  }

  /**
   * Activate tabbed navigation for actor sheets.
   *
   * Foundry's ApplicationV2 tab handler expects the clicked tab control to
   * identify both its tab and group. The system's templates define the group
   * on the navigation container, so this compatibility layer keeps the active
   * tab and panel in sync for those sheets.
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
      current: this.actor.img,
      callback: (path) => this.actor.update({ img: path })
    });
    return picker.browse(this.actor.img);
  }

  async _onSubmit(event, form, formData) {
    const updateData = foundry.utils.expandObject(formData.object);
    return this.document.update(updateData);
  }

  _getActionTarget(event, target) {
    return target ?? event.currentTarget;
  }

  _isEditableAction(event) {
    event.preventDefault();
    return this.isEditable;
  }

  _onItemEdit(event, target) {
    event.preventDefault();
    const li = $(this._getActionTarget(event, target)).parents('.item');
    const item = this.actor.items.get(li.data('itemId'));
    item.sheet.render(true);
  }

  _onEffortRoll(event, target) {
    event.preventDefault();
    const element = this._getActionTarget(event, target);
    let data = {"speaker": { "actor": this.actor._id }};
    if(this.token?._id){
      data = {"speaker": {
        "alias": this.token.name,
        "scene": this.token.parent._id,
        "token": this.token._id,
      }};
    }
    const diceNumber = Number.parseInt(element.outerText);
    effortRoll(diceNumber, data)
  }

  async _onRest(event) {
    if (!this._isEditableAction(event)) return;

    const restHTML = await foundry.applications.handlebars.renderTemplate('systems/lone-wolf-fists/templates/popups/popup-rest.hbs');
    const restData = await foundry.applications.api.DialogV2.wait({
      window: { title: "How long would you like to rest?" },
      content: restHTML,
      buttons: [{
        action: "submit",
        label: "Rest",
        default: true,
        callback: (event, button) => {
          const formData = new FormDataExtended(button.form);
          return formData.object;
        }
      }]
    });

    if(!restData) return;

    if(restData["full-rest"] === "true"){
      this.actor.update({[ `system.health.value` ]: this.actor.system.health.max
       })
      return;
    }
    else {
      if(isNaN(parseInt(restData["hours-rested"]))){
        const errorHtml = "<div>Hours rested must be a whole number</div>";
        ui.notifications.error(errorHtml);
        return;
      }
      const rolls = await new Roll(`${restData["hours-rested"]}d10`).evaluate();
      const newHealth = rolls._total + this.actor.system.health.value;
      this.actor.update({[ `system.health.value` ]: newHealth})
    }
  }

  _onRecoverPrana(event) {
    if (!this._isEditableAction(event)) return;
    chakraReset(this.actor);
  }

  _onToggleChakra(event, target) {
    if (!this._isEditableAction(event)) return;
    const element = this._getActionTarget(event, target);
    // Find the chakra type
    let chakra = element.parentElement.dataset.imbtype;

    // Find the current value of the chakra
    const awakened = this.actor.system.chakras.awakened;
    let update = !(awakened[chakra]);

    // Update the actor with the inverted value
    this.actor.update({[ `system.chakras.awakened.${chakra}` ]: update})

  }

  _onIncreaseChakra(event) {
    if (!this._isEditableAction(event)) return;
    let newActive = this.actor.system.chakras.value + 1;
    this.actor.update({['system.chakras.value']: newActive})
  }

  _onDecreaseChakra(event) {
    if (!this._isEditableAction(event)) return;
    let newActive = this.actor.system.chakras.value - 1;
    this.actor.update({['system.chakras.value']: newActive});
  }

  _onPranaFlare(event) {
    if (!this._isEditableAction(event)) return;
    const artifacts = this.actor.items.filter(i => i.type === "artifact")
    let extraPrana = 0;
    if(artifacts.length > 0){
      for (const artifact of artifacts){
        if(!artifact.system.chakra.hasChakra ||
          artifact.system.chakra.recovery <= 0 ||
          (!artifact.system.worn && !artifact.system.held)){
          continue
        }
        extraPrana += artifact.system.chakra.recovery;
      }
    }
    let newActive = this.actor.system.chakras.value + 1;
    let increase = this.actor.system.pool.recovery * newActive;
    increase = increase + this.actor.system.prana.value + extraPrana;
    this.actor.update({['system.chakras.value']: newActive, ['system.prana.value']: increase});
  }

  async _onChooseMasteries(event, target) {
    if (!this._isEditableAction(event)) return;
    const element = this._getActionTarget(event, target);
    const names = [];
    for (let i in LWFSKILLS){
      if(this.actor.system.masteries.types[LWFSKILLS[i]] !== true){
        let newName = LWFSKILLS[i].concat(" Mastery");
        names.push(newName);
      }
    }
    const pack = game.packs.get("lone-wolf-fists.masteries");
    const index = await pack.getIndex();
    const missing = Array.from(index).filter(({name}) => names.includes(name));
    const difference = parseInt(element.dataset.missing);
    const masteries = {"missing": missing, "difference": difference};
    const masteryHTML = await foundry.applications.handlebars.renderTemplate('systems/lone-wolf-fists/templates/popups/popup-masteries.hbs', masteries)
    const choices = await foundry.applications.api.DialogV2.wait({
      window: { title: "Choose your mastery" },
      content: masteryHTML,
      buttons: [{
        action: "submit",
        label: "Master",
        default: true,
        callback: (event, button) => {
          const formData = new FormDataExtended(button.form);
          return formData.object;
        }
      }]
    });
    if(!choices) return;

    let items = this.actor.items.map(i => i.toObject());
    for(let i in choices){
      if (choices[i] !== null){
        let obj = await game.packs.get('lone-wolf-fists.masteries').getDocument(choices[i]);
        items.push(obj.toObject());
      }
    }
    this.actor.update({ items });
  }


  async _onChooseArchetype(event) {
    if (!this._isEditableAction(event)) return;
    const pack = game.packs.get('lone-wolf-fists.archetypes');
    if (!pack) {
      ui.notifications.error('Could not find the Archetypes compendium.');
      return;
    }

    const archetypes = Array.from(await pack.getIndex()).sort((a, b) => a.name.localeCompare(b.name));
    const archetypeHTML = await foundry.applications.handlebars.renderTemplate(
      'systems/lone-wolf-fists/templates/popups/popup-archetype.hbs',
      { archetypes, current: this.actor.system.archetype }
    );
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: 'Choose your archetype' },
      content: archetypeHTML,
      buttons: [{
        action: 'submit',
        label: 'Choose',
        default: true,
        callback: (event, button) => {
          const formData = new FormDataExtended(button.form);
          return formData.object;
        }
      }]
    });
    if (!choice?.archetype) return;

    const archetype = await pack.getDocument(choice.archetype);
    const items = this.actor.items.filter(i => i.type !== 'archetype').map(i => i.toObject());
    items.push(archetype.toObject());
    return this.actor.update({
      'system.archetype': archetype.system.archetype || archetype.name,
      items
    });
  }

  async _onConfigureAdvancement(event) {
    if (!this._isEditableAction(event)) return;
    if (this.actor.type !== 'character') return;

    const advancementHTML = await foundry.applications.handlebars.renderTemplate(
      'systems/lone-wolf-fists/templates/popups/popup-advancement.hbs',
      { advancement: this.actor.system.advancement }
    );
    const advancement = await foundry.applications.api.DialogV2.wait({
      window: { title: 'Character advancement' },
      content: advancementHTML,
      buttons: [{
        action: 'submit',
        label: 'Save',
        default: true,
        callback: (event, button) => {
          const formData = new FormDataExtended(button.form);
          return formData.object;
        }
      }]
    });
    if (!advancement) return;

    return this.actor.update({
      'system.advancement.effort': Number(advancement.effort) || 0,
      'system.advancement.health': Number(advancement.health) || 0
    });
  }

  _onToggleEditMode(event) {
    if (!this._isEditableAction(event)) return;
    const editMode = !this.actor.system.editMode
    this.actor.update({[ 'system.editMode' ]: editMode})
  }

  _onEffectControl(event, target) {
    if (!this._isEditableAction(event)) return;
    const control = this._getActionTarget(event, target);
    const row = control.closest('li');
    const document =
      row.dataset.parentId === this.actor.id
        ? this.actor
        : this.actor.items.get(row.dataset.parentId);
    const effectEvent = Object.create(event);
    Object.defineProperty(effectEvent, 'currentTarget', { value: control });
    onManageActiveEffect(effectEvent, document);
  }

  _onItemDelete(event, target) {
    if (!this._isEditableAction(event)) return;
    const tr = $(this._getActionTarget(event, target)).parents('.item');
    const item = this.actor.items.get(tr.data('itemId'));
    item.delete();
    tr.slideUp(200, () => this.render(false));
  }

  /** @override */
  activateListeners(html) {


    // -------------------------------------------------------------
    // Everything below here is only needed if the sheet is editable


    if (!this.isEditable) return;

    // Change imbalance data when the data is altered on the sheet
    html.on('change', '.item-choice', (ev) =>{
      const tr = $(ev.currentTarget).parents('.item').data("itemId");
      const item = this.actor.items.get(tr);
      
      // The following if statement is used to detect if the chosen element is selected or not
      // If there is a better way to do this, lmk
      let update;
      if(ev.currentTarget.type === "checkbox")
        update = $(ev.currentTarget).prop('checked');
      else if (ev.currentTarget.nodeName !== "SELECT")
        update = ev.currentTarget.value;
      else
        update = $(ev.currentTarget).find(":selected")[0].value;
      const target = ev.currentTarget.parentElement.dataset.imbtype;
      
      //Check to see if the target is newly de-selected checkbox. If it is, set  update to false
      if(update === undefined)
        update = false;
      if (target === "name")
        item.update({ [ "name" ]: update});
      else
        item.update({ [`system.${target}`]: update});
    })








    html.on('change', '.techniqueDisplay', (ev) => {
      let update = $(ev.currentTarget)[0].value;
      this.actor.update({[ 'system.techTableFocus' ]: update});
    })


    // Add squad member
    html.on('click', '.member-create', (ev) => {
      const arrayOf = ev.currentTarget.dataset.type;
      // Get a copy of the squad member array
      const members = this.actor.system[arrayOf];
      let newMember = {};
      members.push(newMember);
      // Update the current Squad member array with the new values
      this.actor.update({[ `system.${arrayOf}` ]: members})
    })

    html.on('change', '.member-choice', async (ev) => {
      const li = ev.currentTarget.parentElement.parentElement;
      // Get the array index of the member
      const index = li.dataset.id;
      // Get the new value
      const newValue = ev.currentTarget.value;
      // Get the stat being modified
      const target = ev.currentTarget.parentElement.dataset.imbtype;
      //Check to see if the id is a uuid - if it is, update the source and the current sheet
      if(index.includes('.')) {
        const namedMember = await fromUuid(index);
        namedMember.update({[ `system.${target}.lvl` ]: newValue });
        this.actor.update({[ `system.updateToggle` ]: !(this.actor.system.updateToggle)})
      }
      else {
        const arrayOf = li.dataset.arrayOf;
        // Get a copy of the squad member array
        const members = this.actor.system[arrayOf];
        // Change the relvant index
        members[index][target] = newValue;
        this.actor.update({[ `system.${arrayOf}` ]: members });
      }
    })

    html.on('click', '.member-delete', (ev) => {
      const li = ev.currentTarget.parentElement.parentElement;
      const location = parseInt(li.dataset.id)
      if(isNaN(location)) {
        const newMembers = this.actor.system.namedMembers;
        const index = newMembers.indexOf(ev.currentTarget.parentElement.parentElement.dataset.id.split("-")[1]);
        newMembers.splice(index, 1);
        this.actor.update({[ `system.namedMembers`]: newMembers});
      }
      else {
        const arrayOf = li.dataset.arrayOf;
        const newMembers = this.actor.system[arrayOf];
        newMembers.splice(location, 1);
        this.actor.update({[ `system.${arrayOf}`]: newMembers});
      }
    })

    html.on('click', '.member-edit', async (ev) => {
      //Find the id of the member being edited
      const li = $(ev.currentTarget).closest('.item');
      const member = await fromUuid(li.data('id'));
      //render the sheet
      member.sheet.render(true);
    })

    html.on('change', '#membership-set', (ev) => {
      let value = ev.currentTarget.value;
      if (value > 100)
        value = 100;
      else if (value < 0)
        value = 0;
      this.actor.update({[ 'system.membership.max' ]: value, [ 'system.membership.value' ]: value, [ 'system.health.value' ]: value * 10})
    })

    html.on('change', '.anatomy-choice', async (ev) => {
      const anatomyId = $(ev.currentTarget).closest('.body-part')[0].dataset.itemId;
      const anatomy = this.actor.items.get(anatomyId);
      let newValue;
      if(ev.currentTarget.nodeName == 'SELECT') {
        newValue = $(ev.currentTarget).find(':selected')[0].value;
      }
      else {
        newValue = ev.currentTarget.value;
      }
      const target = ev.currentTarget.parentElement.dataset.imbtype;
      if (target === 'name') {
        return await anatomy.update({[ `name` ]: newValue })
      }
      else
        return await anatomy.update({[ `system.${target}` ]: newValue })
    })





    // Drag events for macros.
    if (this.actor.isOwner) {
      let handler = (ev) => this._onDragStart(ev);
      html.find('li.item').each((i, li) => {
        if (li.classList.contains('inventory-header')) return;
        li.setAttribute('draggable', true);
        li.addEventListener('dragstart', handler, false);
      });
    }
  }

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  async _onItemCreate(event, target) {
    event.preventDefault();
    const header = this._getActionTarget(event, target);
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    const data = foundry.utils.deepClone(header.dataset);
    // Initialize a default name.
    const name = `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data,
    };
    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.system['type'];
    delete itemData.system['action'];

    // Finally, create the item!
    return await Item.create(itemData, { parent: this.actor });
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event, target) {
    event.preventDefault();
    const element = this._getActionTarget(event, target);
    const dataset = element.dataset;

    // Handle item rolls.
    if (dataset.rollType) {
      if (dataset.rollType == 'item') {
        const itemId = element.closest('.item').dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (item) return item.roll();
      }
    }

    // Handle rolls that supply the formula directly.
    if (dataset.roll) {
      let label = dataset.label ? `[ability] ${dataset.label}` : '';
      let roll = new Roll(dataset.roll, this.actor.getRollData());
      roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label,
        rollMode: game.settings.get('core', 'rollMode'),
      });
      return roll;
    }
  }

  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;

    const itemData = item.toObject();
    if (this.actor.type === 'character' && itemData.type === 'clan') {
      const items = this.actor.items.filter(i => i.type !== 'clan').map(i => i.toObject());
      items.push(itemData);
      return this.actor.update({
        'system.clan': itemData.system?.clan || itemData.name,
        items
      });
    }

    return super._onDropItem(event, data);
  }

  async _onDropActor(event, data) {
    if (!this.actor.isOwner || (this.actor.isOwner && !(this.actor.type ==='squad' || this.actor.type === 'character' || this.actor.type === 'npc' || this.actor.type === 'domain' )))
      return false;
    // Get the id of the dropped creature
    const id = data.uuid;
    const disciple = await fromUuid(id);
    // Only npcs or characters can be disciples
    if(!(disciple.type === "npc" || disciple.type === "character" || disciple.type === 'squad' || (disciple.type === 'platoon' && this.actor.type === 'domain') ))
      return false;
    if(this.actor.type != 'squad') {
      let content;
      let isRuler = false
      if(this.actor.type === 'domain') {
        content = `ruler`;
        isRuler = true;
      }
      else {
        content = `disciple`
      }
      const newFollower = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Confirm" },
        content: `<p>Make ${disciple.name} the ${content} of ${this.actor.name}?</p>`,
        modal: true
      })
      if(!newFollower)
        return false;
      disciple.update({[ `system.master.id` ]: this.actor.uuid, [ `system.master.isRuler`]: isRuler })
    }
    if(this.actor.type === 'domain') {
      this.actor.update({[ `system.ruler` ]: id})
    }
    else {
      // Get a copy of the squad member array
      const members = this.actor.system.namedMembers;
      members.push(id);
      // Update the current Squad member array with the new values
      this.actor.update({[ `system.namedMembers` ]: members})
    }
  }
}
