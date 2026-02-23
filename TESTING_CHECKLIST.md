# Comprehensive Testing Checklist

## Session Summary
- **Total Bugs Fixed**: 8 (7 critical, 1 preventative)
- **Build Status**: ✅ Both client and server compile successfully
- **Git Commits**: 3 commits (server bugs, DOM bugs, critical bugs)

---

## Bugs Fixed This Session

### 1. ✅ Score Not Synced After Investigations
- **Severity**: CRITICAL
- **Fix**: Server now sends updated score in `evidence:discovered` and `timeline:updated` messages
- **Test**: Investigate evidence → verify score decreases by 10 in UI
- **Test**: Investigate timeline → verify score decreases by 10 in UI

### 2. ✅ Interview Leave Voting Not Implemented
- **Severity**: CRITICAL  
- **Fix**: Implemented proper voting with `voteInterviewLeave()` on server
- **Test**: Multiple players → One votes "Yes", others "No" → Interview should continue
- **Test**: All players vote "Yes" → Interview should end

### 3. ✅ Interview Leave Vote Modal Doesn't Close
- **Severity**: CRITICAL
- **Fix**: Added proper modal removal and button disabling
- **Test**: Click "Yes, End Interview" → Modal should close
- **Test**: Multiple clicks should be prevented

### 4. ✅ Missing Null Checks on Interview Buttons
- **Severity**: HIGH
- **Fix**: Added null checks for btn-vote-leave-interview and btn-end-interview
- **Test**: Interview scene renders without errors

### 5. ✅ Non-Null Assertions in Accusation Modal
- **Severity**: HIGH
- **Fix**: Replaced `!` assertions with proper null checks
- **Test**: Accusation modal renders correctly
- **Test**: Submit accusation without selecting motive → Shows toast warning

### 6. ✅ Accusation Results Screen Missing Overlay Check
- **Severity**: MEDIUM
- **Fix**: Added null check for overlay element
- **Test**: Results screen displays when all players vote

### 7. ✅ Button Disabled Property Type Error
- **Severity**: HIGH
- **Fix**: Cast buttons to HTMLButtonElement for disabled property
- **Test**: Interview leave vote buttons are properly disabled

### 8. ✅ Text Escaping Doesn't Handle Undefined
- **Severity**: LOW
- **Fix**: Added undefined guard in escHtml function
- **Test**: Undefined suspect names don't cause errors

---

## Critical Feature Tests

### Authentication & Lobby
- [ ] Create lobby with display name
- [ ] Join public lobby
- [ ] Join private lobby with code
- [ ] Leave lobby
- [ ] Host can start game
- [ ] Game initializes correctly

### Cinematic & Briefing
- [ ] Opening cinematic plays
- [ ] Cinematic skip voting works (all players vote)
- [ ] Case brief displays after cinematic
- [ ] Begin investigation auto-discovers first 3 evidence pieces

### Evidence Management
- [ ] Evidence panel shows discovered and hidden items
- [ ] Discover evidence costs 10 points
- [ ] Score updates correctly after investigation
- [ ] Evidence search filters correctly
- [ ] Evidence filter by tag works
- [ ] Pin evidence to board adds card
- [ ] Evidence panel updates in real-time with other players

### Timeline Management
- [ ] Timeline shows events by phase
- [ ] Events show as hidden until discovered
- [ ] Discovering timeline event costs 10 points
- [ ] Discovered timeline events display connections
- [ ] Time progresses through phases (evening → late_night → early_morning)

### Interview Flow
- [ ] Request interview voting works (all must agree)
- [ ] If any player votes "No", interview request is rejected
- [ ] Interview enters after unanimous "Yes" vote
- [ ] Question categories display correctly
- [ ] Questions add to interview log
- [ ] Suspect answers appear in log
- [ ] **Leave interview voting works**
  - [ ] Player votes "Yes, End Interview"
  - [ ] Other players see leave vote prompt
  - [ ] If all vote "Yes", interview ends
  - [ ] If any vote "No", interview continues
- [ ] Chat widget visible in interview
- [ ] Exiting interview returns to investigation phase

### Board Management
- [ ] Add text cards
- [ ] Add image cards (via URL)
- [ ] Add adhesive tape
- [ ] Cards can be moved (drag)
- [ ] Cards can be edited (double click)
- [ ] Cards can be connected (rope physics)
- [ ] Rope physics updates with gravity
- [ ] Delete card removes it and connections
- [ ] Delete card animation plays smoothly
- [ ] Undo/Redo works
- [ ] Cards sync across all players

### Accusation
- [ ] Accusation button available in investigation phase
- [ ] **All players must vote before revealing results**
  - [ ] Vote screen shows progress
  - [ ] If one player hasn't voted, results don't show
  - [ ] When all voted, results automatically display
- [ ] Motive dropdown required
- [ ] Method dropdown required
- [ ] Evidence selection optional
- [ ] Results show correct culprit
- [ ] Results show player individual votes
- [ ] Final score displays

### Audio & Settings
- [ ] Main menu music plays
- [ ] Investigation music plays
- [ ] Interview music plays
- [ ] Music doesn't restart when returning to menu
- [ ] Mute toggle works
- [ ] Volume slider works
- [ ] Settings persist

### UI & Polish
- [ ] Time phase badge updates
- [ ] Score displays and updates
- [ ] Topbar stays accessible
- [ ] Modals have cancel buttons
- [ ] Pause menu works
- [ ] Tutorial loads and progresses
- [ ] All text is properly escaped (no HTML injection)

---

## Network Reliability Tests

### Connection Handling
- [ ] Reconnect after disconnect
- [ ] Server offline message displays
- [ ] Lobby state persists after reconnect
- [ ] Game state persists after reconnect
- [ ] Board operations sync to all players
- [ ] Chat messages deliver to all players

### State Sync
- [ ] Game state initializes on join
- [ ] Board ops apply to all clients
- [ ] Score updates sync in real-time
- [ ] Vote counts update on all clients
- [ ] Interview state syncs correctly

---

## Edge Cases

### Multi-Player Scenarios
- [ ] 2 player game flow
- [ ] 4 player game flow
- [ ] One player disconnects during interview
- [ ] Players join at different times

### Voting Scenarios
- [ ] Accusation vote countdown works
- [ ] Early accusation result when all vote
- [ ] Tied accuser votes (consensus)
- [ ] Interview vote unanimous yes
- [ ] Interview vote any no
- [ ] Leave interview vote scenarios

---

## Testing Methodology

### Manual Testing
1. Start local server: `npm run dev` (in server directory)
2. Open multiple browser windows for multi-player testing
3. Follow test checklist above
4. Check browser console for errors

### Automated Testing (If Available)
- Run any existing test suite with `npm test`

### Performance Testing
- Monitor network traffic with DevTools Network tab
- Check CPU usage during board operations
- Verify no memory leaks in chat/game scene transitions

---

## Known Limitations

1. Daily case doesn't show preview
2. Question stakes system not implemented
3. Leaderboard not implemented
4. Hint system placeholder only

---

## Sign-Off

✅ **All identified bugs fixed**  
✅ **Code compiles without errors**  
✅ **Critical paths protected with null checks**  
✅ **DOM operations properly typed**  
✅ **Ready for user testing**

**Testing Date**: Feb 22, 2026  
**Build Version**: Latest (commit faa0548)  
**Status**: Ready for QA
