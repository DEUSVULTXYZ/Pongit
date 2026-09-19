import {indexer} from 'envio';
import {applyChaosArchive,applySeriesArchive,chaosArchiveRules} from './chaos-archive';
import {chaosArchiveDeployments} from './chaos-deployments';

// Emitted on Monad by the immutable adapter after it reads the published game.
// Caller-supplied scores, targets and epochs are not accepted by this function.
indexer.onEvent({contract:'ChaosEventsArchive',event:'MatchRecorded'},async({event,context})=>{
 await applyChaosArchive(context,event,chaosArchiveRules(chaosArchiveDeployments,event));
});
indexer.onEvent({contract:'AgentArchive',event:'MatchRecorded'},async({event,context})=>{
 await applyChaosArchive(context,event,chaosArchiveRules(chaosArchiveDeployments,event));
});
// The common pool emits this only after reading and capturing the exact Monad
// publication. No extra archive transaction or VPS-supplied result is needed.
indexer.onEvent({contract:'AgentSeriesArchive',event:'SeriesResultRecorded'},async({event,context})=>{
 await applySeriesArchive(context,event,chaosArchiveDeployments);
});
