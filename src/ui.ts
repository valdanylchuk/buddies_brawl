import { gameState, type GameState, type PlayerState, type PlayerId } from './gameState.js';
import { eventBus } from './eventBus.js';
import type { Card } from './decks.js';
import { AIController } from './ai.js';

// --- Types & DOM Query Helper ---
interface PlayerUI {
    area: HTMLElement;
    hand: HTMLElement;
    activeSlot: HTMLElement;
    benchSlots: HTMLElement[];
    stats: HTMLElement;
}

const $ = <T extends HTMLElement>(selector: string, scope: Document | HTMLElement = document): T => {
    const el = scope.querySelector<T>(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    return el;
};

// --- Module State ---
let p1UI: PlayerUI, p2UI: PlayerUI;
let winMessage: HTMLElement, cardModal: HTMLElement, cardModalImage: HTMLImageElement;
let p1ReadyBtn: HTMLButtonElement, endTurnBtn: HTMLButtonElement;
let lastState: GameState | null = null;
let longPressTimer: number | null = null;
const LONG_PRESS_DURATION = 500;
let touchDragData: string | null = null;

// --- Animation Logic ---
function animateAttack(attackerEl: HTMLElement, defenderEl: HTMLElement, lungeDirection: 'up' | 'down') {
    const lungeDistance = lungeDirection === 'up' ? -40 : 40;
    
    // --- Get the parent container ---
    const attackerSlot = attackerEl.parentElement;
    if (!attackerSlot) return; // Safety check

    // --- Attacker Animation ---
    // 1. Add classes to BOTH the card and its parent slot
    attackerSlot.classList.add('slot-is-active');
    attackerEl.classList.add('card-is-attacking');

    attackerEl.animate([
        { transform: 'translateY(0) scale(1)', zIndex: 'auto' },
        // zIndex during lunge needs to be high, but our class z-index is higher
        { transform: `translateY(${lungeDistance}px) scale(1.05)`, zIndex: '50' },
        { transform: 'translateY(0) scale(1)', zIndex: 'auto' }
    ], { duration: 400, easing: 'ease-out' });

    // 2. Remove classes from BOTH when the animation ends
    attackerEl.addEventListener('animationend', () => {
        attackerEl.classList.remove('card-is-attacking');
        attackerSlot.classList.remove('slot-is-active');
    }, { once: true });


    // --- Defender Animation (no change) ---
    defenderEl.classList.add('card-is-hit');
    defenderEl.addEventListener('animationend', () => {
        defenderEl.classList.remove('card-is-hit');
    }, { once: true });
}

function animateCardMove(fromRect: DOMRect, toEl: HTMLElement) {
    const toRect = toEl.getBoundingClientRect();
    if (toRect.width === 0 && toRect.height === 0) return;

    const ghost = toEl.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, {
        position: 'fixed', zIndex: '1000', margin: '0',
        left: `${fromRect.left}px`, top: `${fromRect.top}px`,
        width: `${fromRect.width}px`, height: `${fromRect.height}px`,
    });
    document.body.appendChild(ghost);
    toEl.style.opacity = '0';

    ghost.animate([
        { transform: 'translate(0, 0)', width: `${fromRect.width}px`, height: `${fromRect.height}px` },
        { transform: `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px)`, width: `${toRect.width}px`, height: `${toRect.height}px` }
    ], { duration: 400, easing: 'ease-in-out' }).onfinish = () => {
        toEl.style.opacity = '1';
        ghost.remove();
    };
}

function animateBoardChanges(oldGs: GameState | null, newGs: GameState) {
    if (!oldGs) {
        render(newGs);
        return;
    }

    const oldP1Active = oldGs.players[1].active;
    const newP1Active = newGs.players[1].active;
    const aiAttacked = oldP1Active && (!newP1Active || oldP1Active.hp! > newP1Active.hp!);

    // Case 1: AI attacked.
    if (aiAttacked) {
        // Make a small delay before starting the attack animation.
        // This solves the race condition where an AI evolves its attacker and immediately attacks.
        // The evolution animation (`animateCardMove`) takes 400ms. This delay ensures
        // that animation has finished and the attacker card is visible before we tell it to lunge.
        const attackAnimDelay = 450; // Slightly longer than animateCardMove's 400ms duration.
        
        setTimeout(() => {
            const attackerEl = p2UI.activeSlot.querySelector<HTMLElement>('.card');
            const defenderEl = p1UI.activeSlot.querySelector<HTMLElement>('.card');
            if (attackerEl && defenderEl) {
                animateAttack(attackerEl, defenderEl, 'down');
            }
            // We still delay the final render to allow the attack animation (400ms) to complete.
            setTimeout(() => render(newGs), 500);
        }, attackAnimDelay);
        
        // Stop here to prevent the conflicting card movement logic from running for this update.
        return;
    }

    // Case 2: No AI attack. Animate card placements normally.
    const oldPositions = new Map<string, DOMRect>();
    document.querySelectorAll<HTMLElement>('.card[data-card-uid]').forEach(el => {
        oldPositions.set(el.dataset.cardUid!, el.getBoundingClientRect());
    });

    render(newGs); // Render the new state immediately.

    requestAnimationFrame(() => { // And animate the difference.
        for (const pId of [1, 2] as const) {
            const oldPState = oldGs.players[pId];
            const newPState = newGs.players[pId];
            const playedFromHand = oldPState.hand.filter(c => !newPState.hand.some(nc => nc.uid === c.uid));

            for (const card of playedFromHand) {
                const isNowOnBoard = newPState.active?.uid === card.uid || newPState.bench.some(bc => bc?.uid === card.uid);
                if (isNowOnBoard) {
                    const fromRect = oldPositions.get(card.uid!);
                    const toEl = document.querySelector<HTMLElement>(`[data-card-uid="${card.uid!}"]`);
                    if (fromRect && toEl) animateCardMove(fromRect, toEl);
                }
            }
        }
    });
}

// --- Rendering Logic ---
function createCardElement(card: Card, dataset: Record<string, string> = {}): HTMLDivElement {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'card';
    Object.assign(cardDiv.dataset, dataset, { cardId: card.id, cardUid: card.uid! });
    cardDiv.innerHTML = `
        <img src="images/${card.id}.png" alt="${card.name}" class="card-image">
        <div class="card-hp">${card.hp ?? ''}</div>`;
    return cardDiv;
}
function renderPlayer(id: PlayerId, pState: PlayerState, gState: GameState) {
    const ui = id === 1 ? p1UI : p2UI;
    const isHuman = id === 1;
    const isTurn = gState.currentPlayer === id;
    const isSetup = gState.phase === 'setup';
    const canAct = isHuman && (isTurn || isSetup);
    ui.stats.textContent = `${isHuman ? 'P1' : 'AI'} - Points: ${pState.points}`;
    const handCards = pState.hand.map((card, index) => {
        const cardEl = createCardElement(card, { handIndex: String(index) });
        if (canAct) {
             if (card.evolvesFrom && !isSetup && !(gState.turnCount === 1 && isTurn)) {
                 cardEl.draggable = true;
             } else if (card.id === 'base-008' && !isSetup) { // Chicken Nugget
                 cardEl.draggable = true;
             } else if (card.isTrainer || card.isBasic) {
                 cardEl.dataset.action = 'playCard';
             } else {
                 cardEl.classList.add('disabled');
             }
        } else cardEl.classList.add('disabled');
        return cardEl;
    });
    ui.hand.replaceChildren(...handCards);
    const activeCard = pState.active ? createCardElement(pState.active, (canAct && !isSetup) ? { action: 'attack' } : {}) : null;
    if (activeCard) activeCard.classList.add('active-buddy');
    ui.activeSlot.replaceChildren(...(activeCard ? [activeCard] : []));
    ui.benchSlots.forEach((slot, i) => {
        const card = pState.bench[i];
        let benchCard = null;
        if (card) {
            const dataset: Record<string, string> = {};
            if (canAct && (pState.active ? !isSetup : true)) {
                dataset.action = pState.active ? 'retreat' : 'promote';
                dataset.benchIndex = String(i);
            }
            benchCard = createCardElement(card, dataset);
        }
        slot.replaceChildren(...(benchCard ? [benchCard] : []));
    });
}
function render(gs: GameState) {
    renderPlayer(1, gs.players[1], gs);
    renderPlayer(2, gs.players[2], gs);
    const isSetup = gs.phase === 'setup';
    p1ReadyBtn.classList.toggle('hidden', !(isSetup && !gs.setupReady[1]));
    endTurnBtn.classList.toggle('hidden', isSetup || gs.currentPlayer !== 1);
    p1UI.area.classList.toggle('current-player', gs.currentPlayer === 1 && !isSetup);
    p2UI.area.classList.toggle('current-player', gs.currentPlayer === 2 && !isSetup);
}

// --- Event Handlers ---
function handleGameClick(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const { action, handIndex, benchIndex } = target.dataset;

    if (action === 'attack') {
        const attackerEl = p1UI.activeSlot.querySelector<HTMLElement>('.card');
        const defenderEl = p2UI.activeSlot.querySelector<HTMLElement>('.card');
        if (attackerEl && defenderEl) {
            animateAttack(attackerEl, defenderEl, 'up');
            setTimeout(() => gameState.attack(), 500);
        }
        return;
    }
    switch (action) {
        case 'playCard': return gameState.playCard(1, parseInt(handIndex!, 10));
        case 'promote':  return gameState.promote(1, parseInt(benchIndex!, 10));
        case 'retreat':  return gameState.retreat(1, parseInt(benchIndex!, 10));
    }
}
function handlePointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const cardEl = (e.target as HTMLElement).closest<HTMLElement>('.card');
    if (!cardEl) return;
    const clear = () => { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; };
    document.addEventListener('pointerup', clear, { once: true });
    longPressTimer = window.setTimeout(() => {
        cardEl.dispatchEvent(new CustomEvent('longpress', { bubbles: true }));
    }, LONG_PRESS_DURATION);
}

// Touch handler required for drag handling on mobile.
function handleTouchStart(e: TouchEvent) {
    const draggedItem = (e.target as HTMLElement).closest<HTMLElement>('.card[draggable="true"]');
    if (!draggedItem) return;
    e.preventDefault();
    let lastTarget: Element | null = null, isDragging = false;
    const dispatch = (el: Element | null, name: string) => el?.dispatchEvent(new CustomEvent(name, { bubbles: true }));

    const onTouchMove = (moveEvent: TouchEvent) => {
        moveEvent.preventDefault();
        if (!isDragging) {
            isDragging = true;
            touchDragData = draggedItem.dataset.handIndex ?? null;
            dispatch(draggedItem, 'dragstart');
        }
        const { clientX, clientY } = moveEvent.touches[0];
        const currentTarget = document.elementFromPoint(clientX, clientY);
        if (lastTarget !== currentTarget) {
            dispatch(lastTarget, 'dragleave');
            dispatch(currentTarget, 'dragenter');
            lastTarget = currentTarget;
        }
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', () => {
        document.removeEventListener('touchmove', onTouchMove);
        if (isDragging) {
            dispatch(lastTarget, 'drop');
            draggedItem.classList.remove('dragging'); // Handle cleanup directly
        }
        touchDragData = null;
    }, { once: true });
}

// --- Initialization ---
function setupPlayerArea(id: PlayerId): PlayerUI {
    const area = $(`#player-${id}-area`);
    area.appendChild($<HTMLTemplateElement>('#player-area-template').content.cloneNode(true));
    const benchContainer = $('.bench', area);
    const benchSlots = Array.from({ length: 3 }, (_, i) => {
        const slot = document.createElement('div');
        slot.className = 'bench-slot';
        slot.dataset.benchIndex = String(i);
        benchContainer.appendChild(slot);
        return slot;
    });
    return { area, benchSlots, hand: $('.hand', area), activeSlot: $('.active-slot', area), stats: $('.player-stats', area) };
}
function init() {
    p1UI = setupPlayerArea(1);
    p2UI = setupPlayerArea(2);
    winMessage = $('#win-message');
    cardModal = $('#card-modal');
    cardModalImage = $('#card-modal-image');
    const p1Controls = $('.player-controls', p1UI.area);
    // Create buttons programmatically to avoid destroying existing elements
    const readyBtn = document.createElement('button');
    readyBtn.id = 'p1-ready-btn';
    readyBtn.className = 'hidden';
    readyBtn.textContent = 'P1 Ready';

    const turnBtn = document.createElement('button');
    turnBtn.id = 'end-turn-btn';
    turnBtn.className = 'hidden';
    turnBtn.textContent = 'End Turn';

    p1Controls.appendChild(readyBtn);
    p1Controls.appendChild(turnBtn);

    p1ReadyBtn = readyBtn;
    endTurnBtn = turnBtn;

    p1UI.area.addEventListener('click', handleGameClick);
    document.body.addEventListener('pointerdown', handlePointerDown);
    document.body.addEventListener('longpress', (e: Event) => {
        const cardId = (e.target as HTMLElement).dataset.cardId;
        if (cardId) cardModalImage.src = `images/${cardId}.png`;
        cardModal.classList.remove('hidden');
    });
    p1UI.area.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    p1UI.area.addEventListener('dragstart', e => {
        if (longPressTimer) clearTimeout(longPressTimer);
        const card = e.target as HTMLElement;
        // The `e.dataTransfer` check is important. Our polyfilled event won't have it.
        if (card.classList.contains('card') && card.draggable && (e as DragEvent).dataTransfer) {
            (e as DragEvent).dataTransfer!.setData('text/plain', card.dataset.handIndex!);
            card.classList.add('dragging');
        } else {
            // This handles the polyfilled event.
            card.classList.add('dragging');
        }
    });
    p1UI.area.addEventListener('dragend', e => (e.target as HTMLElement).classList.remove('dragging'));
    p1UI.area.addEventListener('drop', e => {
        e.preventDefault();
        const slot = (e.target as HTMLElement).closest<HTMLElement>('.bench-slot, .active-slot');
        slot?.classList.remove('drop-target-hover');
         
        const handIndex = (e as DragEvent).dataTransfer?.getData('text/plain') || touchDragData;
 
        if (slot && handIndex) {
            const benchIndex = slot.dataset.benchIndex ? parseInt(slot.dataset.benchIndex) : -1;
            const handCard = gameState.players[1].hand[parseInt(handIndex)];
            if (handCard?.id === 'base-008') {
                // This is Chicken Nugget - use special evolution logic
                gameState.playChickenNugget(1, parseInt(handIndex), benchIndex);
            } else {
                // Regular evolution
                gameState.evolve(1, parseInt(handIndex), benchIndex);
            }
        }
    });
    p1UI.area.addEventListener('dragover', e => e.preventDefault());
    p1UI.area.addEventListener('dragenter', e => (e.target as HTMLElement).closest?.('.bench-slot, .active-slot')?.classList.add('drop-target-hover'));
    p1UI.area.addEventListener('dragleave', e => (e.target as HTMLElement).closest?.('.bench-slot, .active-slot')?.classList.remove('drop-target-hover'));
    
    p1ReadyBtn.addEventListener('click', () => gameState.setPlayerReady(1));
    endTurnBtn.addEventListener('click', () => gameState.endTurn());
    $('.card-modal-close').addEventListener('click', () => cardModal.classList.add('hidden'));
    cardModal.addEventListener('click', e => { if (e.target === cardModal) cardModal.classList.add('hidden'); });
    winMessage.addEventListener('click', () => location.reload());

    const ai = new AIController(2, gameState);
    eventBus.addEventListener('gameInitialized', (e: Event) => {
        const gs = (e as CustomEvent<GameState>).detail;
        render(gs);
        lastState = JSON.parse(JSON.stringify(gs));
        setTimeout(() => ai.setup(), 50);
    }, { once: true });
    eventBus.addEventListener('gameStateUpdated', (e: Event) => {
        const gs = (e as CustomEvent<GameState>).detail;
        animateBoardChanges(lastState, gs);
        lastState = JSON.parse(JSON.stringify(gs));
    });
    eventBus.addEventListener('gameEnded', (e: Event) => {
        const { winner } = (e as CustomEvent<{ winner: PlayerId }>).detail;
        winMessage.textContent = `Player ${winner} Wins!`;
        winMessage.classList.remove('hidden');
    });
    eventBus.addEventListener('turnStarted', (e: Event) => {
        const { currentPlayer } = (e as CustomEvent<{ currentPlayer: PlayerId }>).detail;
        if (currentPlayer === 2) setTimeout(() => ai.executeTurn(), 750);
    });

    gameState.initializeGame();
}

export { init }; // for tests
document.addEventListener('DOMContentLoaded', init);