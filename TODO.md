# TODO
## Project Setup
- upgrade to python 3.12
- give claude access to Riftbound core rules and errata
- have claude write up a feature list for this app
- have claude write a landing page for this app
- when a new set comes out, i want the you to automatically pull from https://playriftbound.com/en-us/card-gallery/
- when new rules are added, i want you to automatically pull from https://playriftbound.com/en-us/rules-hub/
- create a commit push skill that looks at the changes, proposes commits, lets the user review, once confirmed, pushes the changes

## Bugs
- (unverified) if there are no copies of a card, default count to 0 instead of leaving it blank (check list view proving grounds)
- (unverified) i think i noticed a case where i had a copy of a card and it was still showing in the missing section?
- missing page options
  - 1 of each, 3 of each (should always show foil tracker -> as these are master sets)
- when toggling btwn grid and list view, the sorting/filtering options that can affect grid/list should be hidden/appear accordingly (like grid only sorting options should show on grid view only)

## Features
### Game Partner
- bug
  - starting a game + undoing game start (ui shows "not started") and hitting next turn -> next player becomes the starting player...
- score tracker color coding turns (red for opp, blue for you?)
- score tracker naming
  - should i do a me/you that flips? as turns go by? having the legend card name makes it a bit confusing imo
  - players could also be playing the same legend
- event log
  - 2 col base, one for each player. the items in the list should be stagged by turn so you can see when turns are passed & thus what happened each turn
  - ex. but 

| turn | me | opp |
| 1 |  |  |
|  |  |  |
| 2 | c |  |
|  |  | c |
| 3 | hold + conquer |  |
|  |  |  |
| 4 | hold x2 |  |
|  |  | conquer x2 |
...

  - instead of a list, it should be more of a order based thing (ex. showing order & what happened each turn)
  - want to make it so that one glance the players can tell what happened, rather than reading the log
- functionality to delete match history should eventually be disabled

### Vetting
- sorting/filtering (still a bit jank)
  - after picking <ALL> and <OGN> and sort by color -> i want runes, tokens, legends (multi-color), sig spells to be filtered to the end
  - enable sorting by unit/spell/gear
- reactive window size
  - resizing the window messes up the card spacing a lot
- collecting/playset
  - list view
    - add alternating colors (ex. gray/white) per row
- your inventory/cost tracking (are you up or down $$$)
  - happy path -> take a picture of cards (the model should be fine with partial obfuscation of the cards, messy layout, bad resolution)
  - add a confirmation screen for teh user to confirm counts before adding to collection
  - adding a revert function to revert imports
  - add a history of imports (so you can select which ones to revert)

## Future Work
- voice recording
  - approximate the game state based on what the players are saying
- matchup analysis, (once we have users and data)
  - mulligans that are best for the matchups
  - key cards in decks that help boost winrate

## IceBox
- have a deck builder feature
  - do you have the cards to build this
  - how much will it cost you
  - multi-deck import to see card comparisons (what a deck took out/put in)
  - what cards should you bring to an event (so that you can side in/out after each event based on local meta/matchups)

## OTHER
### Legends
- OGN legends
  - voli
  - leona
  - viktor
- SFD legends
  - draven
  - azir
  - ezreal

### Promos
- SFD NN promo
  - chaos rune