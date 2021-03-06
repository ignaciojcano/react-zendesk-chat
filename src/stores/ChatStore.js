import { log, isAgent, isTrigger } from './../utils';
import { createStore } from 'redux';
import SortedMap from 'collections/sorted-map';

const DEFAULT_STATE = {
	connection: 'closed',
	account_status: 'offline',
	departments: {},
	visitor: {},
	agents: {},
	chats: SortedMap(),
	last_timestamp: 0,
  is_chatting: false,
  history: { loaded: false, chats: [] },
  historyChats: {}
};

// IMPT: Need to return on every case
function update(state = DEFAULT_STATE, action) {
	log('action', action);

	if (action.detail && action.detail.timestamp)
		state.last_timestamp = action.detail.timestamp;

	switch (action.type) {
		case 'connection_update':
			return {
				...state,
				connection: action.detail
			};
		case 'account_status':
			return {
				...state,
				account_status: action.detail
			};
		case 'department_update':
			return {
				...state,
				departments: {
					...state.departments,
					[action.detail.id]: action.detail
				}
			};
    case 'visitor_update':
			return {
				...state,
				visitor: {
					...state.visitor,
					...action.detail
				}
			};
		case 'agent_update':
			return {
				...state,
				agents: {
					...state.agents,
					[action.detail.nick]: {
						...action.detail,
						nick: action.detail.nick, // To be removed after standardization
						typing: (state.agents[action.detail.nick] || {typing: false}).typing
					}
				}
			};
		case 'chat':
			let new_state = { ...state };

			switch (action.detail.type) {
				/* Web SDK events */
				case 'chat.memberjoin':
					if (isAgent(action.detail.nick)) {
						if (!new_state.agents[action.detail.nick]) new_state.agents[action.detail.nick] = {};
						new_state.agents[action.detail.nick].nick = action.detail.nick;
					}
					else
						new_state.visitor.nick = action.detail.nick;

					if (!isAgent(action.detail.nick)) {
						new_state.is_chatting = true;
					}

					// Concat this event to chats to be displayed
					new_state.chats = state.chats.concat({
						[action.detail.timestamp]: {
							...action.detail
						}
          });

					return new_state;
				case 'chat.memberleave':
					if (!isAgent(action.detail.nick)) {
						new_state.is_chatting = false;
          }

					// Concat this event to chats to be displayed
					new_state.chats = state.chats.concat({
						[action.detail.timestamp]: {
							...action.detail
						}
          });

					return new_state;
				case 'chat.file':
				case 'chat.wait_queue':
				case 'chat.request.rating':
        case 'chat.msg':
					// Ensure that triggers are uniquely identified by their display names
					if (isTrigger(action.detail.nick))
            action.detail.nick = `agent:trigger:${action.detail.display_name}`;

          const { msg_id, timestamp } = action.detail;
          const id = msg_id ? `${timestamp}${msg_id}` : timestamp;

					new_state.chats = state.chats.concat({
						[id]: {
							...action.detail,
              member_type: isAgent(action.detail.nick) ? 'agent' : 'visitor'
						}
          });

					return new_state;
				case 'typing':
					let agent = state.agents[action.detail.nick];
					// Ensure that triggers are uniquely identified by their display names
					if (isTrigger(action.detail.nick)) {
						agent = {
							nick: `agent:trigger:${action.detail.display_name}`,
							display_name: action.detail.display_name
						};
					}
					return {
						...state,
						agents: {
							...state.agents,
							[agent.nick]: {
								...agent,
								typing: action.detail.typing
							}
						}
					};
				default:
					return state;
      }
    case 'history_loaded':
      const { loaded, chats } = action.detail;

      return {
        ...state,
        history: { loaded, chats }
      };
    case 'clean_chats':
      return {
        ...state,
        chats: SortedMap()
      };
    case 'history_chats':
      return {
        ...state,
        historyChats: {
          ...state.historyChats,
          [action.detail.id]: action.detail.messages
        }
      };
		default:
			log('unhandled action', action);
			return state;
	}
}

function storeHandler(state = DEFAULT_STATE, action) {
	let result, new_action = {};
	if (action.type === 'synthetic') {
		log('synthetic action', action);

		const new_timestamp = !!state.last_timestamp ? (state.last_timestamp + 1) : (new Date()).getTime();

		switch (action.detail.type) {
			case 'visitor_send_msg':
				new_action = {
					type: 'chat',
					detail: {
						type: 'chat.msg',
						display_name: state.visitor.display_name,
						nick: state.visitor.nick || 'visitor:',
						timestamp: new_timestamp,
						msg: action.detail.msg,
						source: 'local'
					}
				};
				break;
			case 'visitor_send_file':
				new_action = {
					type: 'chat',
					detail: {
						type: 'chat.file',
						display_name: state.visitor.display_name,
						nick: state.visitor.nick || 'visitor:',
						timestamp: new_timestamp,
						attachment: action.detail.attachment,
						source: 'local'
					}
				}
				break;
			default:
				new_action = action;
		}

		result = update(state, new_action);
	} else {
		result = update(state, action);
	}

	return result;
}

// Create a Redux store holding the state of your app.
// Its API is { subscribe, dispatch, getState }.
// let ChatStore = createStore(update, applyMiddleware(chatMiddleware));
let ChatStore = createStore(storeHandler, window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__());

export default ChatStore;
