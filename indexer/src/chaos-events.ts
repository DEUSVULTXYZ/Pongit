import {indexer} from 'envio';
import {applyChaosArchive,chaosArchiveRules} from './chaos-archive';
import {chaosArchiveDeployments} from './chaos-deployments';

// Emitted on Monad by the immutable adapter after it reads the published game.
// Caller-supplied scores, targets and epochs are not accepted by this function.
indexer.onEvent({contract:'ChaosEventsArchive',event:'MatchRecorded'},async({event,context})=>{
 await applyChaosArchive(context,event,chaosArchiveRules(chaosArchiveDeployments,event));
});
indexer.onEvent({contract:'AgentArchive',event:'MatchRecorded'},async({event,context})=>{
 await applyChaosArchive(context,event,chaosArchiveRules(chaosArchiveDeployments,event));
});
