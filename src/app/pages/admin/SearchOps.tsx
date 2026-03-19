import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AiOps } from '../../components/admin/search/AiOps';
import { SearchDashboard } from '../../components/admin/search/SearchDashboard';
import { SearchLab } from '../../components/admin/search/SearchLab';
import { RelevanceSettings } from '../../components/admin/search/RelevanceSettings';
import { Merchandising } from '../../components/admin/search/Merchandising';
import { Operations } from '../../components/admin/search/Operations';

export type SearchOpsTab = 'overview' | 'lab' | 'relevance' | 'merch' | 'ai' | 'ops';

interface SearchOpsProps {
  activeSection?: string;
}

export function SearchOps({ activeSection = 'search_ops_dashboard' }: SearchOpsProps) {
  
  const activeTab: SearchOpsTab = useMemo(() => {
    switch (activeSection) {
      case 'search_ops_lab': return 'lab';
      case 'search_ops_ai': return 'ai';
      case 'search_ops_relevance': return 'relevance';
      case 'search_ops_merch': return 'merch';
      case 'search_ops_ops': return 'ops';
      case 'search_ops_dashboard':
      default: return 'overview';
    }
  }, [activeSection]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Content Area - No internal sidebar/header anymore */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {activeTab === 'overview' && <SearchDashboard />}
            {activeTab === 'lab' && <SearchLab />}
            {activeTab === 'ai' && <AiOps />}
            {activeTab === 'relevance' && <RelevanceSettings />}
            {activeTab === 'merch' && <Merchandising />}
            {activeTab === 'ops' && <Operations />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
