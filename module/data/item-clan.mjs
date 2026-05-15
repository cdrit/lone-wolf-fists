import lwfItemBase from "./base-item.mjs";

export default class lwfClan extends lwfItemBase {

  static defineSchema() {
    const { StringField, HTMLField } = foundry.data.fields;
    const schema = super.defineSchema();

    schema.clan = new StringField();
    schema.deed = new HTMLField();
    schema.vice = new HTMLField();
    schema.landmark = new HTMLField();

    return schema;
  }
  prepareDerivedData() {

  }

}