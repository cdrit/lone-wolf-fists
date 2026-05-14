// Inspired by "One roll Engine" by Shemetz
// Source: https://github.com/shemetz/one-roll-engine
const SETLENGTH = 10;

/**
 * Trigger Dice So Nice's 3D animation for a Foundry Roll when the module is active.
 *
 * ChatMessage rolls are preserved so existing Foundry chat handling continues to work, while this
 * helper adds an explicit Dice So Nice hand-off for the system's custom effort messages.
 *
 * @param {Roll} roll The evaluated roll to animate.
 * @param {ChatMessage} message The chat message that contains the roll.
 * @returns {Promise<void>}
 */
export async function animateDiceSoNice(roll, message) {
  if (!game.dice3d?.showForRoll) return;

  const speaker = message.speaker ?? ChatMessage.getSpeaker();
  const whisper = message.whisper ?? [];
  const blind = message.blind ?? false;

  try {
    await game.dice3d.showForRoll(roll, game.user, true, whisper, blind, message.id, speaker);
  } catch (error) {
    console.warn('Lone Wolf Fists | Dice So Nice animation failed.', error);
  }
}

export async function effortRoll(diceNumber, data) {
  // Roll the set number of dice
  const rolls = await new Roll(`${diceNumber}d10`).evaluate();

  // Get the raw dice results
  const rollResult = rolls.terms[0].results.map(roll => roll.result);

  // Sort them into groups based on their facing
  const counts = new Array(SETLENGTH).fill(0);
  rollResult.forEach(roll => {
    if(roll < SETLENGTH)
      counts[roll] += 1
    else
      counts[0] += 1
  });
  // Create an object with only the popuated sets present, in order
  const sets = [];
  counts.forEach((rank, facing) => {
    if(rank >= 1){
      let set = new Array(rank).fill(facing);
      sets.push(set)
    }
  });
  // Display these groups as a chat message

  data.content = await foundry.applications.handlebars.renderTemplate(`systems/lone-wolf-fists/templates/chat-messages/effort-roll.hbs`, { sets })
  data.rolls = [rolls];
  data.flags = { core: { canPopout: true } };

  const message = await ChatMessage.create(data, {});
  await animateDiceSoNice(rolls, message);
  return message;

}

export async function extractDiceNumber(message, data) {
  let command = message.split(" ");
  const diceNumber = Number.parseInt(command[1]);
  if(Number.isNaN(diceNumber)) {
    ui.notifications.error(
      `<div>Your command could not be parsed:</div>
      <div>${message}</div>
      <div>Rolls should look like: /effort 7</div>`
    )
    return;
  }
  
  await effortRoll(diceNumber, data)
  return null;
}
