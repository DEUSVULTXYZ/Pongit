// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AuthorityStore as S} from "./AuthorityStore.sol";

interface ILobbyRatings {
    struct Rating {
        uint32 elo;
        uint32 played;
        uint32 wins;
        uint32 season;
    }
    function ratingOf(address player, uint8 mode) external view returns (Rating memory);
}

/// Immutable linked library: executes in the arena's storage, never on a server.
library ContractLobby {
    uint256 constant QUEUED = type(uint256).max;

    struct Member {
        address player;
        uint48 joined;
        uint40 position;
        bool away;
    }

    struct Room {
        uint256 id;
        address host;
        uint8 mode;
        bool ranked;
        uint64 created;
        uint64 activity;
        address winner;
        uint256 proposal;
        Member[] members;
    }

    struct Proposal {
        uint256 id;
        uint256 room;
        address a;
        address b;
        uint64 expires;
        uint8 accepted;
        uint8 status;
    }

    struct Invitation {
        uint256 id;
        uint256 room;
        address sender;
        address recipient;
        uint64 expires;
        uint8 status;
    }
    event RoomChanged(uint256 indexed room, uint256 indexed generation);
    event QueueChanged(address indexed player, uint8 mode, bool queued);
    event ProposalChanged(uint256 indexed proposal, uint256 indexed room, uint8 status);
    event InvitationChanged(
        uint256 indexed invitation, address indexed sender, address indexed recipient, uint8 status
    );
    event ParticipationChanged(address indexed player, uint256 room, uint256 generation);

    function occupancy(mapping(bytes32 => uint256) storage w, address p) public view returns (uint256) {
        return S.get(w, 10, uint160(p), 1) == S.generation(w) ? S.get(w, 10, uint160(p), 0) : 0;
    }

    function _occupy(mapping(bytes32 => uint256) storage w, address p, uint256 id) private {
        S.set(w, 10, uint160(p), 0, id);
        S.set(w, 10, uint160(p), 1, S.generation(w));
        emit ParticipationChanged(p, id, S.generation(w));
    }

    function _roomValid(mapping(bytes32 => uint256) storage w, uint256 id) private view {
        require(id != 0 && id >> 128 == S.generation(w) && S.get(w, 13, id, 0) != 0, "room unavailable");
    }

    function member(mapping(bytes32 => uint256) storage w, uint256 id, uint256 i)
        public
        view
        returns (Member memory m)
    {
        uint256 x = S.get(w, 13, id, 16 + i);
        m = Member(address(uint160(x)), uint48(x >> 160), uint40(x >> 208), (x >> 248) & 1 == 1);
    }

    function _member(mapping(bytes32 => uint256) storage w, uint256 id, uint256 i, Member memory m) private {
        S.set(
            w,
            13,
            id,
            16 + i,
            uint160(m.player) | (uint256(m.joined) << 160) | (uint256(m.position) << 208) | (m.away ? 1 << 248 : 0)
        );
    }

    function _index(mapping(bytes32 => uint256) storage w, uint256 id, address p) private view returns (uint256) {
        for (uint256 i; i < 8; i++) {
            if (member(w, id, i).player == p) return i;
        }
        revert("not a member");
    }

    function room(mapping(bytes32 => uint256) storage w, uint256 id) public view returns (Room memory r) {
        _roomValid(w, id);
        uint256 t = S.get(w, 13, id, 0);
        r.id = id;
        r.host = address(uint160(S.get(w, 13, id, 1)));
        r.mode = uint8(t >> 128);
        r.ranked = ((t >> 136) & 1) == 1;
        r.created = uint64(t);
        r.activity = uint64(t >> 64);
        r.winner = address(uint160(S.get(w, 13, id, 4)));
        r.proposal = S.get(w, 13, id, 3);
        r.members = new Member[](S.get(w, 13, id, 2));
        uint256 j;
        for (uint256 i; i < 8; i++) {
            Member memory m = member(w, id, i);
            if (m.player != address(0)) r.members[j++] = m;
        }
    }

    function _touch(mapping(bytes32 => uint256) storage w, uint256 id) private {
        uint256 t = S.get(w, 13, id, 0);
        S.set(w, 13, id, 0, (t & ~(uint256(type(uint64).max) << 64)) | (block.timestamp << 64));
        emit RoomChanged(id, S.generation(w));
    }

    function createRoom(mapping(bytes32 => uint256) storage w, address actor, uint8 mode, bool ranked)
        public
        returns (uint256 id)
    {
        require(mode < 2 && actor != address(0) && occupancy(w, actor) == 0, "participation exists");
        require(block.timestamp < type(uint48).max, "time range");
        id = S.nextId(w);
        S.set(
            w, 13, id, 0, block.timestamp | (block.timestamp << 64) | (uint256(mode) << 128) | (ranked ? 1 << 136 : 0)
        );
        S.set(w, 13, id, 1, uint160(actor));
        S.set(w, 13, id, 2, 1);
        S.set(w, 13, id, 5, 1);
        _member(w, id, 0, Member(actor, uint48(block.timestamp), 0, false));
        _occupy(w, actor, id);
        _touch(w, id);
    }

    function _blocked(mapping(bytes32 => uint256) storage w, address a, address b) private view returns (bool) {
        return S.get(w, 17, uint160(a), uint160(b)) != 0 || S.get(w, 17, uint160(b), uint160(a)) != 0;
    }

    function blockPlayer(mapping(bytes32 => uint256) storage w, address actor, address other, bool value) public {
        require(actor != other && other != address(0), "player");
        S.set(w, 17, uint160(actor), uint160(other), value ? 1 : 0);
    }

    function join(mapping(bytes32 => uint256) storage w, address actor, uint256 id) public {
        _roomValid(w, id);
        if (occupancy(w, actor) == id) return;
        require(occupancy(w, actor) == 0 && !room(w, id).ranked, "participation exists");
        _join(w, actor, id);
    }

    function _join(mapping(bytes32 => uint256) storage w, address actor, uint256 id) private {
        uint256 count = S.get(w, 13, id, 2);
        require(count < 8, "room full");
        uint256 t = S.get(w, 13, id, 0);
        require(block.timestamp <= uint64(t >> 64) + (count == 0 ? 30 minutes : 24 hours), "room expired");
        for (uint256 i; i < 8; i++) {
            Member memory m = member(w, id, i);
            if (m.player != address(0)) require(!_blocked(w, actor, m.player), "blocked");
        }
        uint256 position = S.get(w, 13, id, 5);
        require(position < type(uint40).max, "queue range");
        for (uint256 i; i < 8; i++) {
            if (member(w, id, i).player == address(0)) {
                _member(w, id, i, Member(actor, uint48(block.timestamp), uint40(position), false));
                break;
            }
        }
        S.set(w, 13, id, 5, position + 1);
        S.set(w, 13, id, 2, count + 1);
        if (count == 0) S.set(w, 13, id, 1, uint160(actor));
        _occupy(w, actor, id);
        _touch(w, id);
    }

    function proposal(mapping(bytes32 => uint256) storage w, uint256 id) public view returns (Proposal memory p) {
        uint256 t = S.get(w, 14, id, 3);
        p = Proposal(
            id,
            S.get(w, 14, id, 0),
            address(uint160(S.get(w, 14, id, 1))),
            address(uint160(S.get(w, 14, id, 2))),
            uint64(t),
            uint8(t >> 64),
            uint8(t >> 72)
        );
    }

    function _status(mapping(bytes32 => uint256) storage w, uint256 id, uint8 status) private {
        uint256 t = S.get(w, 14, id, 3);
        S.set(w, 14, id, 3, (t & ~(uint256(255) << 72)) | (uint256(status) << 72));
        emit ProposalChanged(id, S.get(w, 14, id, 0), status);
    }

    function slot(mapping(bytes32 => uint256) storage w, uint256 i) public view returns (uint256) {
        require(i < 2, "slot");
        return S.get(w, 15, S.generation(w), i);
    }

    function _release(mapping(bytes32 => uint256) storage w, uint256 id) private {
        for (uint256 i; i < 2; i++) {
            if (slot(w, i) == id) S.set(w, 15, S.generation(w), i, 0);
        }
        uint256 r = S.get(w, 14, id, 0);
        if (S.get(w, 13, r, 3) == id) S.set(w, 13, r, 3, 0);
    }

    function propose(mapping(bytes32 => uint256) storage w, uint256 r, uint64 lifetime) public returns (uint256 id) {
        _roomValid(w, r);
        id = S.get(w, 13, r, 3);
        if (id != 0) return id;
        uint256 available = slot(w, 0) == 0 ? 0 : slot(w, 1) == 0 ? 1 : 2;
        require(available < 2, "arena capacity");
        Room memory v = room(w, r);
        require(block.timestamp <= v.activity + 24 hours, "room expired");
        address a;
        address b;
        uint256 first = type(uint256).max;
        uint256 second = type(uint256).max;
        for (uint256 i; i < v.members.length; i++) {
            Member memory m = v.members[i];
            if (m.away) continue;
            uint256 rank = m.player == v.winner ? 0 : uint256(m.position) + 1;
            if (rank < first) {
                b = a;
                second = first;
                a = m.player;
                first = rank;
            } else if (rank < second) {
                b = m.player;
                second = rank;
            }
        }
        require(a != address(0) && b != address(0) && !_blocked(w, a, b), "two available players required");
        require(lifetime == 20 || lifetime == 60, "proposal lifetime");
        id = S.nextId(w);
        S.set(w, 14, id, 0, r);
        S.set(w, 14, id, 1, uint160(a));
        S.set(w, 14, id, 2, uint160(b));
        S.set(w, 14, id, 3, (block.timestamp + lifetime) | (1 << 72));
        S.set(w, 13, r, 3, id);
        S.set(w, 15, S.generation(w), available, id);
        _touch(w, r);
        emit ProposalChanged(id, r, 1);
    }

    function accept(mapping(bytes32 => uint256) storage w, address actor, uint256 id) public returns (bool start) {
        Proposal memory p = proposal(w, id);
        _roomValid(w, p.room);
        require(actor == p.a || actor == p.b, "not a participant");
        uint8 bit = actor == p.a ? 1 : 2;
        if (p.status == 2 && p.accepted & bit != 0) return false;
        require(p.status == 1 && block.timestamp <= p.expires && S.get(w, 13, p.room, 3) == id, "proposal expired");
        require(!_blocked(w, p.a, p.b), "blocked");
        if (p.accepted & bit != 0) return false;
        p.accepted |= bit;
        S.set(w, 14, id, 3, uint256(p.expires) | (uint256(p.accepted) << 64) | (uint256(p.accepted == 3 ? 2 : 1) << 72));
        _touch(w, p.room);
        emit ProposalChanged(id, p.room, p.accepted == 3 ? 2 : 1);
        return p.accepted == 3;
    }

    function _away(mapping(bytes32 => uint256) storage w, uint256 r, address p) private {
        uint256 i = _index(w, r, p);
        Member memory m = member(w, r, i);
        m.away = true;
        _member(w, r, i, m);
        if (address(uint160(S.get(w, 13, r, 4))) == p) S.set(w, 13, r, 4, 0);
    }

    function decline(mapping(bytes32 => uint256) storage w, address actor, uint256 id) public {
        Proposal memory p = proposal(w, id);
        _roomValid(w, p.room);
        require(p.status == 1 && (actor == p.a || actor == p.b), "proposal");
        _away(w, p.room, actor);
        _status(w, id, 4);
        _release(w, id);
        _touch(w, p.room);
    }

    function expire(mapping(bytes32 => uint256) storage w, uint256 id) public {
        Proposal memory p = proposal(w, id);
        _roomValid(w, p.room);
        require(p.status == 1 && block.timestamp > p.expires, "not expired");
        if (p.accepted & 1 == 0) _away(w, p.room, p.a);
        if (p.accepted & 2 == 0) _away(w, p.room, p.b);
        _status(w, id, 4);
        _release(w, id);
        _touch(w, p.room);
    }

    function rejoin(mapping(bytes32 => uint256) storage w, address actor, uint256 id) public {
        _roomValid(w, id);
        uint256 i = _index(w, id, actor);
        Member memory m = member(w, id, i);
        require(m.away, "already queued");
        uint256 pos = S.get(w, 13, id, 5);
        require(pos < type(uint40).max, "queue range");
        m.away = false;
        m.position = uint40(pos);
        S.set(w, 13, id, 5, pos + 1);
        _member(w, id, i, m);
        _touch(w, id);
    }

    function leave(mapping(bytes32 => uint256) storage w, address actor) public {
        uint256 r = occupancy(w, actor);
        _roomValid(w, r);
        require(S.get(w, 1, uint160(actor), 0) == 0, "concede active match first");
        uint256 i = _index(w, r, actor);
        uint256 id = S.get(w, 13, r, 3);
        Proposal memory p = proposal(w, id);
        if (id != 0 && p.status == 1 && (p.a == actor || p.b == actor)) {
            _status(w, id, 4);
            _release(w, id);
        }
        _member(w, r, i, Member(address(0), 0, 0, false));
        if (address(uint160(S.get(w, 13, r, 4))) == actor) S.set(w, 13, r, 4, 0);
        _occupy(w, actor, 0);
        S.set(w, 13, r, 2, S.get(w, 13, r, 2) - 1);
        if (address(uint160(S.get(w, 13, r, 1))) == actor) {
            address next;
            uint256 oldest = type(uint256).max;
            for (uint256 j; j < 8; j++) {
                Member memory m = member(w, r, j);
                if (m.player != address(0) && m.joined < oldest) {
                    next = m.player;
                    oldest = m.joined;
                }
            }
            S.set(w, 13, r, 1, uint160(next));
        }
        _touch(w, r);
    }

    function finish(mapping(bytes32 => uint256) storage w, uint256 id, address winner) public {
        Proposal memory p = proposal(w, id);
        if (p.status != 2) return;
        _status(w, id, 3);
        _release(w, id);
        S.set(w, 13, p.room, 4, uint160(winner));
        if (winner != address(0)) {
            address loser = winner == p.a ? p.b : p.a;
            uint256 i = _index(w, p.room, loser);
            Member memory m = member(w, p.room, i);
            uint256 pos = S.get(w, 13, p.room, 5);
            require(pos < type(uint40).max, "queue range");
            m.position = uint40(pos);
            S.set(w, 13, p.room, 5, pos + 1);
            _member(w, p.room, i, m);
        }
        _touch(w, p.room);
    }

    function _qid(uint256 generation, uint8 mode, uint256 n) private pure returns (uint256) {
        return uint256(keccak256(abi.encode(generation, mode, n)));
    }

    function queue(mapping(bytes32 => uint256) storage w, address actor, uint8 mode) public {
        require(mode < 2 && occupancy(w, actor) == 0, "participation exists");
        uint256 q = (S.generation(w) << 8) | mode;
        uint256 n = S.get(w, 11, q, 1) + 1;
        S.set(w, 11, q, 1, n);
        uint256 id = _qid(S.generation(w), mode, n);
        S.set(w, 12, id, 0, uint160(actor));
        S.set(w, 12, id, 1, block.timestamp | ((block.timestamp + 30) << 64));
        S.set(w, 10, uint160(actor), 2, id);
        S.set(w, 10, uint160(actor), 3, mode);
        _occupy(w, actor, QUEUED);
        emit QueueChanged(actor, mode, true);
    }

    function queueOf(mapping(bytes32 => uint256) storage w, address actor)
        public
        view
        returns (uint8 mode, uint64 since, uint64 expires)
    {
        if (occupancy(w, actor) != QUEUED) return (0, 0, 0);
        mode = uint8(S.get(w, 10, uint160(actor), 3));
        uint256 t = S.get(w, 12, S.get(w, 10, uint160(actor), 2), 1);
        return (mode, uint64(t), uint64(t >> 64));
    }

    function queueHeartbeat(mapping(bytes32 => uint256) storage w, address actor) public {
        require(occupancy(w, actor) == QUEUED, "not queued");
        uint256 id = S.get(w, 10, uint160(actor), 2);
        uint256 t = S.get(w, 12, id, 1);
        require(uint64(t >> 64) >= block.timestamp, "queue expired");
        S.set(w, 12, id, 1, uint64(t) | ((block.timestamp + 30) << 64));
    }

    function cancelQueue(mapping(bytes32 => uint256) storage w, address actor) public {
        require(occupancy(w, actor) == QUEUED, "not queued");
        S.set(w, 12, S.get(w, 10, uint160(actor), 2), 0, 0);
        _occupy(w, actor, 0);
    }

    function _queued(mapping(bytes32 => uint256) storage w, uint256 id) private returns (address p) {
        p = address(uint160(S.get(w, 12, id, 0)));
        if (p == address(0)) return p;
        if (uint64(S.get(w, 12, id, 1) >> 64) < block.timestamp) {
            S.set(w, 12, id, 0, 0);
            if (occupancy(w, p) == QUEUED && S.get(w, 10, uint160(p), 2) == id) _occupy(w, p, 0);
            return address(0);
        }
    }

    function matchmake(mapping(bytes32 => uint256) storage w, uint8 mode, uint256 budget) public returns (uint256 r) {
        require(mode < 2 && budget >= 3 && budget <= 32, "scan bound");
        uint256 g = S.generation(w);
        uint256 q = (g << 8) | mode;
        if (slot(w, 0) != 0 && slot(w, 1) != 0) return 0;
        uint256 head = S.get(w, 11, q, 0);
        if (head == 0) head = 1;
        uint256 tail = S.get(w, 11, q, 1);
        uint256 used;
        address a;
        while (head <= tail && used < budget) {
            used++;
            a = _queued(w, _qid(g, mode, head));
            if (a != address(0)) break;
            head++;
        }
        S.set(w, 11, q, 0, head);
        if (a == address(0) || used == budget) return 0;
        uint256 outer = S.get(w, 11, q, 3);
        if (outer < head || outer > tail) outer = head;
        uint256 cursor = S.get(w, 11, q, 2);
        if (cursor <= outer || cursor > tail) cursor = outer + 1;
        while (outer < tail && used < budget) {
            a = _queued(w, _qid(g, mode, outer));
            used++;
            if (a == address(0)) {
                outer++;
                cursor = outer + 1;
                continue;
            }
            uint256 at = uint64(S.get(w, 12, _qid(g, mode, outer), 1));
            uint256 width = 100 + 50 * ((block.timestamp - at) / 15);
            if (width > 600) width = 600;
            uint256 elo = ILobbyRatings(address(this)).ratingOf(a, mode).elo;
            while (cursor <= tail && used < budget) {
                used++;
                address b = _queued(w, _qid(g, mode, cursor));
                if (b != address(0) && !_blocked(w, a, b)) {
                    uint256 other = ILobbyRatings(address(this)).ratingOf(b, mode).elo;
                    if ((elo > other ? elo - other : other - elo) <= width) {
                        S.set(w, 12, _qid(g, mode, outer), 0, 0);
                        S.set(w, 12, _qid(g, mode, cursor), 0, 0);
                        _occupy(w, a, 0);
                        _occupy(w, b, 0);
                        S.set(w, 11, q, 0, outer == head ? head + 1 : head);
                        S.set(w, 11, q, 2, 0);
                        S.set(w, 11, q, 3, 0);
                        r = createRoom(w, a, mode, true);
                        _join(w, b, r);
                        propose(w, r, 20);
                        return r;
                    }
                }
                cursor++;
            }
            if (cursor > tail) {
                outer++;
                cursor = outer + 1;
            }
        }
        if (outer >= tail) {
            outer = head;
            cursor = head + 1;
        }
        S.set(w, 11, q, 2, cursor);
        S.set(w, 11, q, 3, outer);
    }

    function invitation(mapping(bytes32 => uint256) storage w, uint256 id) public view returns (Invitation memory v) {
        uint256 t = S.get(w, 16, id, 3);
        v = Invitation(
            id,
            S.get(w, 16, id, 0),
            address(uint160(S.get(w, 16, id, 1))),
            address(uint160(S.get(w, 16, id, 2))),
            uint64(t),
            uint8(t >> 64)
        );
    }

    function invite(mapping(bytes32 => uint256) storage w, address actor, uint256 r, address target, uint64 ttl)
        public
        returns (uint256 id)
    {
        _roomValid(w, r);
        _index(w, r, actor);
        // Ranked participants are selected by matchmaking, never by a room invite.
        require(!room(w, r).ranked, "ranked room admission");
        require(
            target != address(0) && target != actor && !_blocked(w, actor, target) && occupancy(w, target) == 0,
            "opponent unavailable"
        );
        require(ttl == 60 || ttl == 600, "invitation lifetime");
        uint256 pair = uint256(keccak256(abi.encode(actor, target)));
        uint256 last = S.get(w, 18, pair, 0);
        Invitation memory old = invitation(w, last);
        if (old.room == r && old.status == 1 && old.expires >= block.timestamp) return last;
        require(block.timestamp >= S.get(w, 18, pair, 1) + 60, "invitation cooldown");
        id = S.nextId(w);
        S.set(w, 16, id, 0, r);
        S.set(w, 16, id, 1, uint160(actor));
        S.set(w, 16, id, 2, uint160(target));
        S.set(w, 16, id, 3, (block.timestamp + ttl) | (1 << 64));
        S.set(w, 18, pair, 0, id);
        S.set(w, 18, pair, 1, block.timestamp);
        emit InvitationChanged(id, actor, target, 1);
    }

    function answerInvite(mapping(bytes32 => uint256) storage w, address actor, uint256 id, bool yes)
        public
        returns (uint256 p)
    {
        Invitation memory v = invitation(w, id);
        _roomValid(w, v.room);
        require(v.status == 1 && v.expires >= block.timestamp, "invitation expired");
        require(actor == v.recipient || (!yes && actor == v.sender), "recipient only");
        S.set(w, 16, id, 3, uint256(v.expires) | (uint256(yes ? 2 : 3) << 64));
        emit InvitationChanged(id, v.sender, v.recipient, yes ? 2 : 3);
        if (yes) {
            require(occupancy(w, actor) == 0, "participation exists");
            _join(w, actor, v.room);
            // Joining a room is still possible while both arena slots are occupied.
            p = S.get(w, 13, v.room, 3);
            if (p == 0 && (slot(w, 0) == 0 || slot(w, 1) == 0)) p = propose(w, v.room, 20);
        }
    }

    function expireRoom(mapping(bytes32 => uint256) storage w, uint256 id) public {
        Room memory r = room(w, id);
        require(block.timestamp > r.activity + (r.members.length == 0 ? 30 minutes : 24 hours), "room not expired");
        require(r.proposal == 0, "finish or expire proposal first");
        for (uint256 i; i < r.members.length; i++) {
            require(S.get(w, 1, uint160(r.members[i].player), 0) == 0, "active match");
            _occupy(w, r.members[i].player, 0);
        }
        S.set(w, 13, id, 0, 0);
        emit RoomChanged(id, S.generation(w));
    }
}
