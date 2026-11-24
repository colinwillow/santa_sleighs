# SANTA SLAYS -- design notes (his words first)

**SANTA = BAD SANTA, ON MILK (his, Nov 23):** "an absolute drunk ... bad Santa ... instead of actual alcohol it's milk and cookies,
and he's kind of grumpy." A sloshed, grumpy, crude, swaggering Santa -- milk is his booze, cookies his bar snacks. (Spirit only: our
own character, not the film's.) Play it everywhere: tipsy idle sway, milk-moustache, burps + hiccups, slurred grumbles, chugging a
bottle and tossing it, gruff one-liners. MILK = health AND buzz: the more he's had, the bolder and sloppier (aim sway, wobbly
flight, bigger swagger); run dry and he's a cranky, hungover, slow Santa until he finds more.

**Title: SANTA SLAYS** (his cover art, Nov 23: `images/reference/cover_*.jpg`; `images/cover.jpg` = the loading card).
Cover: rooftop at night, Santa firing the snowflake minigun, cigar; four elves (goggles brunette, curly green-cape elf,
blonde in candy-stripe stockings eating a cookie); milk bottles + cookies; snowmen with teeth, a candy-cane worm, an angry gingerbread man.

**IT IS A SHOOTER (his, Nov 23):** "it's called Santa Slays" -- highly exaggerated Santa with a massive, Rambo-size machine gun
and a fat cigar; it's all about slaying. Cozy-cute world, over-the-top action.

- Cartoon Santa, a grungy / raunchy play on Santa, but a COZY, CUTE game -- suggestive, never explicit.
- Santa: smokes a fat cigar (smoke), drinks LOTS of milk (milk is the big thing), eats + collects cookies; milk + cookies = health.
- A fat machine gun on the sleigh. Buff reindeer pull the sleigh on ropes.
- Cute little sexy elf helpers: one model so far (`models/elf_girl.glb`), reused several times.
- Bad guys: monster snowmen, gingerbread men (to make).
- Maybe: fly house to house down chimneys (naughty / nice kids), or defend things from monsters. Undecided.
- Maybe co-op: one flies the sleigh, one runs the minigun.
- LOOK (Nov 23): cozy snowy neighborhoods, likely generated. Almost gingerbread houses, chimneys, fire pits, glowing windows,
  "a lot of bloom and haze", a beautiful stylized look. A building kit that can be dressed: homes, ground shaders, telephone poles,
  streets, benches, grass, dirt road, sidewalk. Reference: `images/reference/village_dusk.jpg`.

## Concept art (Nov 23, his) -- `images/reference/`
- `crew_poster.jpg` -- Santa + three elves (curly-blonde goggles elf, brunette with the cookie tin, green-outfit elf with a milk jar).
- `santa_minigun.jpg`, `minigun_cigar.jpg`, `minigun_cigar_sheet.jpg` -- THE GUN: a six-barrel minigun, rusty steel + gold rings,
  red snowflake plate, glowing orange vents, brass belt feeding from a curved chute, red snowflake tassel + bell on the handle.
  Cigar: fat, red snowflake band, glowing ember.
- `santa_reindeer_sleigh.jpg`, `santa_sleigh_reindeer_sheet.jpg` -- steampunk sleigh (gold pipes, tufted red leather seat,
  twin blue jet thrusters at the back, lantern, flags, cookie sacks + milk crate), reindeer in goggles + brass harness;
  Santa's alt weapon: a SNOWBALL CANNON; harness with milk bottles + cookie pouches, jetpack.
- `santa_elf_props_sheet.jpg` -- Santa + elf T-poses, goggles, glasses, holly, belts / harness straps / holster, milk-bottle rack,
  snowball ammo, cookie coins.

## Bestiary (from his sheets) -- `enemies_sheet_1.jpg`, `enemies_sheet_2.jpg`
Ground: SNOW BRUTE (huge snowman, top hat, scarf, ground pound), CANDY CANE MARAUDER (thin, spiky armour, cane blade slash),
GINGERBREAD JUGGERNAUT (icing armour, peppermint shield, charge), ELF SABOTEUR (goblin elf, goggles, throws ornament bombs),
YETI SNOWSMASHER, PRESENT MIMIC (box with teeth + spider legs), TOY SOLDIER AUTOMATON (wind-up key, blunderbuss),
ORNAMENT SPIDER, MILKSHOT TANK, COOKIE GOLEM, SUGAR SLIME.
Air: SLEIGH DRONE (bauble with a propeller, antlers, bells).

## Tone (Nov 23)
"Morbid but cute and fluffy at the same time ... big and exaggerated" -- creepy-cute / cute-gore (the Happy Tree Friends,
Cult of the Lamb, Fran Bow lane). Everything a play on candy, Santa, food. Houses: GINGERBREAD, modular and DESTRUCTIBLE
(shoot pieces away, erode with the machine gun, blast through) -- like Korajin's breakable buildings, never Minecraft-looking.

## Gingerbread house -- his reference (Nov 23): `images/reference/gingerbread_house_ref.jpg`
His notes on the first pass: "I don't really love it ... you can just see through the bits and pieces of the house. I said rounded --
I just meant slightly organic; it's OK if it's modular with straighter pieces, however it looks best." So: SOLID cookie-slab walls
(never see-through), soft organic edges, the reference's details: round cookie-shingle roof under thick dripping icing, candy-stripe
chimney, dormer, round window with icing swirls, striped awning, red door with candy-cane posts + wreath, lantern, gumdrops, cookie-stone base.

## Naughty layer (Steam build only; Nov 23)
GTA-style implied humour, never explicit, all behind `CONTENT.naughty` (iOS ships tame). Gags: CAUGHT IN THE ACT (shoot a gingerbread
house open: two gingerfolk under a rocking quilt freeze, stare, blush, grab a pillow and run) -- built, waiting for the new house;
SANTA'S NAUGHTY STOP (sleigh parks behind a chimney / dumpster and rocks, bells jingle faster, heart puffs, Santa pops up, fixes his hat,
relights the cigar, drinks milk) -- idea. Steam: tick sexual content in the content survey (mature notice, stays visible); keep elves clearly adult.

## SLAY (his, Nov 23)
"Slay" has every meaning at once: he's out there CRUSHING IT -- crushing milk, crushing cookies, crushing ladies, crushing gingerbread
houses and monsters. That swagger is the game's attitude.

## Naughty levels (built)
OFF (iOS locked) / CHEEKY (quilt; default, streamer-safe) / CENSORED (the act behind a flickering pixel mosaic + a bouncing CENSORED
sticker that falls off when they're caught) / SPICY (the act, clothed cookies, cartoonish, nothing anatomical -- later a free Steam add-on).
Line we hold: comedic and implied/clothed, never graphic or anatomical; every sexual character clearly adult.

## Multiplayer vision (his, Nov 23) -- not building yet
Friend-slop co-op / battle game: one player drives the sleigh, others run around ON it and shoot off the sides (or everyone
shoots and the sleigh flies on its own). Nobody driving = it keeps going straight, can CRASH -- into gingerbread houses, wrecking
them and throwing everyone off. Destruction battle-royale energy. Guns lie in the level; swap weapons, each with its own ammo
(rockets, machine guns, snowball cannons...). The sleigh may grow big enough to walk around on. He's making enemies.

## The sleigh breaks too (his, Nov 23) -- `models/sleighs/sleigh_01.glb` (133 parts)
Pieces of the sleigh come off under fire, the same way the houses do. The two back BOOSTERS take more hits; shoot one off and the
sleigh goes lopsided -- barrel-rolling, the reins wrapping up and dragging the reindeer down, or snapping so the team flies on
without it. "The worst flight ever" friend-slop chaos (the clips people share). Next after the destructible town.

## Characters + costumes (his, Nov 23)
- Characters are being modelled mostly WITHOUT their clothes (e.g. `models/santa_no_coat.glb`); costumes become separate pieces
  (coat with cloth dynamics / its own rig, hats, belts...) so a player picks a CHARACTER, then customises the COSTUME.
- Built now as single player / co-op / story (enemies are enemies). If it becomes the multiplayer game, every character is
  playable: Santa, the snowman monster, the candy monster, and whatever else he makes -- keep characters rig-compatible
  (Mixamo names + hand mounts) so any of them can drive the same controller and clips.


## THE GOAL: DELIVER THE PRESENTS (his go-ahead, Nov 24 -- proposal, not final)
*His question: "is there a goal? are you destroying houses? maybe you're trying to deliver presents and defend off enemies at the same time."*

**Premise.** Christmas Eve has been hijacked. Snowman brutes, candy-cane monsters and evil elves have overrun the gingerbread
village; the gingerbread folk are hiding in their houses. Santa -- hungover, milk-drunk, armed -- still has to get every present
delivered before DAWN.

**A night (one round, ~6-10 min).**
- The sleigh starts loaded (presents stacked on the sack -- visible, and they can be shot off / stolen).
- The village map marks houses waiting for a delivery (a glowing present icon over the roof).
- TWO WAYS TO DELIVER: (1) CHIMNEY DROP -- fly low + steady over the roof and drop it down the chimney (a skill shot from the
  sleigh; miss and it lands in the yard); (2) DOOR DROP -- land, hop out, fight through the monsters camped at that house, run the
  present to the door (the on-foot game).
- A delivered house lights up warm, the gingerfolk inside cheer at the window, cookies + milk pay out.
- DAWN is the clock: the sky warms as the night runs out; undelivered houses at sunrise = a failed Christmas.

**Why it fits everything already built.**
- Sleigh + boosters = getting around; hopping out on foot = deliveries under siege; guns = protecting the delivery;
  milk / cookies = health + fuel.
- DESTRUCTION BECOMES A CHOICE: you CAN level houses (it's fun), but a house you wreck can't take a present. Crashing through
  a monster-infested house to clear it is a trade-off, not a free action. (Delivered houses could be sturdier.)
- Enemies get ROLES around houses instead of spawning randomly:
  - SNOWMAN BRUTE (built) -- camps at a house, melee + hefty snowball lobs (even up at the sleigh).
  - CANDY CANE MONSTER -- fast, hooks / leaps; ambushes from yards and rooftops.
  - EVIL ELVES -- rooftop snipers / saboteurs that STEAL presents off the sleigh if they reach it (shoot them off).
  - (his other mock-ups slot in here: each one a clear job.)
- WAVES, not random spawns: each delivered house wakes the next block; the night ramps up toward dawn.

**Multiplayer fit (later).** 2-player teams = DRIVER + GUNNER. Team vs team = a delivery race across the same village (shoot
the other sleigh's presents off, steal their houses); co-op = one big village vs the horde; zombies-style survival = hold the
North Pole workshop till dawn.

**First slice to prototype (when he says go):** 3-4 marked houses + chimney drop from the sleigh + a cheer / cookie payout + the
snowmen camping around the undelivered ones. Small enough to feel in one session.
