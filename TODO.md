# TODO
## Project Setup
- upgrade to python 3.12
- give claude access to Riftbound core rules and errata
- have claude write up a feature list for this app
- have claude write a landing page for this app

## Bugs
- running into a lot of index out of bound when searching lots of cards
- if there are no copies of a card, default count to 0 (check list view proving grounds)
- (verify) i think i noticed a case where i had a copy of a card and it was still showing in the missing section?
- missing page options
  - 1 of each, 3 of each (should always show foil tracker -> as these are master sets)
- when toggling btwn grid and list view, the sorting/filtering options that can affect grid/list should be hidden/appear accordingly (like grid only sorting options should show on grid view only)

## Features
- sorting/filtering (still a bit jank)
  - after picking <ALL> and <OGN> and sort by color -> i want runes, tokens, legends (multi-color), sig spells to be filtered to the end
  - enable sorting by unit/spell/gear
- reactive window size
  - resizing the window messes up the card spacing a lot
- collecting/playset
  - list view
    - add alternating colors (ex. gray/white) per row
- score tracking
  - things to track at the start of the match
    - matchup
    - bo1/bo3
    - starting player
  - things to note at start/between games
    - battlefield selection
    - side-in/out
    - mulligan choice
  - things to note during games
    - score (by turn & bf)
      - 3 ways to earn points (conquer, hold, effects)
    - when a player draws from conquer but unable to score
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
  - kaisa
  - voli
  - leona
  - teemo
  - viktor
- SFD legends
  - draven
  - azir
  - ezreal

### Promos
- OGN NN promo
  - consult the past
- SFD NN promo
  - chaos rune