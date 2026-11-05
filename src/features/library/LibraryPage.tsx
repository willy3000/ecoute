import { navigate } from '../../app/router';
import { Segmented } from '../../components/ui';
import { VocabularyTab } from '../vocabulary/VocabularyTab';
import { CollectionDetail } from './CollectionDetail';
import { CollectionsTab } from './CollectionsTab';
import { PhraseBrowser } from './PhraseBrowser';

type Tab = 'collections' | 'phrases' | 'vocabulary';

/**
 * Routes: library, library/phrases, library/phrases/word/<word id>,
 * library/vocabulary, library/collection/<collection id>.
 */
export function LibraryPage({ route }: { route: string[] }) {
  if (route[0] === 'collection' && route[1]) return <CollectionDetail id={route[1]} />;
  const tab: Tab = route[0] === 'phrases' ? 'phrases' : route[0] === 'vocabulary' ? 'vocabulary' : 'collections';
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 md:px-8 md:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <Segmented<Tab>
          label="Library section"
          value={tab}
          onChange={(t) => navigate(t === 'collections' ? 'library' : `library/${t}`)}
          options={[
            { value: 'collections', label: 'Collections' },
            { value: 'phrases', label: 'Phrases' },
            { value: 'vocabulary', label: 'Vocabulary' },
          ]}
        />
      </div>
      {tab === 'collections' ? <CollectionsTab /> : null}
      {tab === 'phrases' ? <PhraseBrowser wordId={route[1] === 'word' ? route[2] : undefined} key={route[2] ?? 'all'} /> : null}
      {tab === 'vocabulary' ? <VocabularyTab /> : null}
    </div>
  );
}
