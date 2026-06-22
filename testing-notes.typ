== Testing Notes 2

Pokemon attack even if they faint the same turn. Update the attack state machine so if an attack is fired and the defending pokemon faints, then it will not attack.

Additionally, gray out the screen and state that the other player is selecting a pokemon if they are forced to switch due to a knock out. If both people are switching, don't state that message until after you have selected your replacement and only show that if the other person has not selected their replacement yet.

Additionally, if you select a replacement and your opponent also needs to select. Do not show the their selection until both players have selected a pokemon.

Use the state machines to commit these changes.

== Testing Notes 3

Everything seems to be working well for attacking moves. Now it's time to move onto making sure all
