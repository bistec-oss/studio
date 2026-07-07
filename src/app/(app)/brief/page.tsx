'use client'

import React from 'react'
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { STEPS } from '@/components/brief/constants'
import { Stepper } from '@/components/brief/Stepper'
import { CampaignStep } from '@/components/brief/CampaignStep'
import { SizeDesignStep } from '@/components/brief/SizeDesignStep'
import { ContentStep } from '@/components/brief/ContentStep'
import { ImagesStep } from '@/components/brief/ImagesStep'
import { ReviewStep } from '@/components/brief/ReviewStep'
import { useBriefWizard } from '@/components/brief/useBriefWizard'

// ---------------------------------------------------------------------------
// Page — thin composition around useBriefWizard; each step lives in
// src/components/brief/.
// ---------------------------------------------------------------------------

export default function NewBriefPage() {
  const wizard = useBriefWizard()
  const { step, setStep, submitting } = wizard

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">New Brief</h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
          Describe what you want to create and we&apos;ll generate an on-brand social post.
        </p>
      </div>

      <GlassPanel className="p-6">
        <Stepper step={step} onJump={setStep} />

        {step === 0 && (
          <CampaignStep
            campaignId={wizard.campaignId}
            kitLoading={wizard.kitLoading}
            resolvedKit={wizard.resolvedKit}
            projectsWithCampaigns={wizard.projectsWithCampaigns}
            standaloneCampaigns={wizard.standaloneCampaigns}
            onSelectCampaign={wizard.selectCampaign}
            onClearCampaign={wizard.clearCampaign}
          />
        )}

        {step === 1 && (
          <SizeDesignStep
            aspectRatio={wizard.aspectRatio}
            setAspectRatio={wizard.setAspectRatio}
            campaignId={wizard.campaignId}
            resolvedKit={wizard.resolvedKit}
            selectedCampaign={wizard.selectedCampaign}
            brandKitId={wizard.brandKitId}
            setBrandKitId={wizard.setBrandKitId}
            brandKitOptions={wizard.brandKitOptions}
            designMode={wizard.designMode}
            setDesignMode={wizard.setDesignMode}
            templateId={wizard.templateId}
            setTemplateId={wizard.setTemplateId}
            referenceTemplateId={wizard.referenceTemplateId}
            setReferenceTemplateId={wizard.setReferenceTemplateId}
            visibleTemplates={wizard.visibleTemplates}
          />
        )}

        {step === 2 && (
          <ContentStep
            topic={wizard.topic}
            setTopic={wizard.setTopic}
            prompt={wizard.prompt}
            setPrompt={wizard.setPrompt}
            goal={wizard.goal}
            setGoal={wizard.setGoal}
            tone={wizard.tone}
            setTone={wizard.setTone}
            campaignId={wizard.campaignId}
            brandKitId={wizard.brandKitId}
          />
        )}

        {step === 3 && (
          <ImagesStep
            images={wizard.images}
            uploading={wizard.uploading}
            fileInputRef={wizard.fileInputRef}
            onFilesPicked={wizard.onFilesPicked}
            removeImage={wizard.removeImage}
            toggleIntent={wizard.toggleIntent}
          />
        )}

        {step === 4 && (
          <ReviewStep
            selectedCampaign={wizard.selectedCampaign}
            selectedBrandKit={wizard.selectedBrandKit}
            aspectRatio={wizard.aspectRatio}
            designMode={wizard.designMode}
            selectedTemplate={wizard.selectedTemplate}
            selectedRefTemplate={wizard.selectedRefTemplate}
            goal={wizard.goal}
            tone={wizard.tone}
            images={wizard.images}
            topic={wizard.topic}
            prompt={wizard.prompt}
            providersLoaded={wizard.providersLoaded}
            copyProviderKey={wizard.copyProviderKey}
            error={wizard.error}
            submitting={submitting}
          />
        )}

        {/* ============================ Navigation ======================== */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/20 dark:border-white/8">
          <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0 || submitting} className="gap-1.5">
            <ChevronLeft size={15} /> Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(s => s + 1)} disabled={!wizard.stepValid(step)} className="gap-1.5">
              Continue <ChevronRight size={15} />
            </Button>
          ) : (
            <Button onClick={wizard.handleGenerate} disabled={submitting || !wizard.copyProviderKey} className="gap-1.5">
              {submitting ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : <><Sparkles size={15} /> Generate Post</>}
            </Button>
          )}
        </div>
      </GlassPanel>
    </div>
  )
}
