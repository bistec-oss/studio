'use client'

import React from 'react'
import { ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHead } from '@/components/ui/PageHead'
import { Panel } from '@/components/ui/Panel'
import { ICON } from '@/components/ui/atoms'
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
    <div className="max-w-3xl">
      <PageHead
        eyebrow="Create"
        title="New post"
        lead="Describe what you want to create and we'll generate an on-brand social post."
        className="mb-6"
      />

      <Stepper step={step} onJump={setStep} />

      {/* The current step on one bezel card (021 design.md §8) */}
      <Panel bezel className="p-5 sm:p-6">
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
            postStyle={wizard.postStyle}
            setPostStyle={wizard.setPostStyle}
            imageStyle={wizard.imageStyle}
            setImageStyle={wizard.setImageStyle}
            imageStyleFromStyle={wizard.imageStyleFromStyle}
            designMode={wizard.designMode}
            setDesignMode={wizard.setDesignMode}
            templateId={wizard.templateId}
            setTemplateId={wizard.setTemplateId}
            referenceTemplateId={wizard.referenceTemplateId}
            setReferenceTemplateId={wizard.setReferenceTemplateId}
            visibleTemplates={wizard.visibleTemplates}
            compositeSource={wizard.compositeSource}
            screenshotUploading={wizard.screenshotUploading}
            screenshotError={wizard.screenshotError}
            screenshotInputRef={wizard.screenshotInputRef}
            onScreenshotPicked={wizard.onScreenshotPicked}
            removeScreenshot={wizard.removeScreenshot}
          />
        )}

        {step === 2 && (
          <ContentStep
            topic={wizard.topic}
            setTopic={wizard.setTopic}
            prompt={wizard.prompt}
            setPrompt={wizard.setPrompt}
            goal={wizard.goal}
            tone={wizard.tone}
            setTone={wizard.setTone}
            toneFromStyle={wizard.toneFromStyle}
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
            postStyle={wizard.postStyle}
            imageStyleFromStyle={wizard.imageStyleFromStyle}
            imageStyle={wizard.imageStyle}
            compositeSource={wizard.compositeSource}
            designMode={wizard.designMode}
            selectedTemplate={wizard.selectedTemplate}
            selectedRefTemplate={wizard.selectedRefTemplate}
            tone={wizard.tone}
            images={wizard.images}
            topic={wizard.topic}
            prompt={wizard.prompt}
            providersLoaded={wizard.providersLoaded}
            copyProviderReady={wizard.copyProviderReady}
            captionRouteMessage={wizard.captionRouteMessage}
            error={wizard.error}
            submitting={submitting}
            captionModel={wizard.captionModel}
            onCaptionModelChange={wizard.setCaptionModel}
            designModel={wizard.designModel}
            onDesignModelChange={wizard.setDesignModel}
            designModelNote={wizard.designModelNote}
            modelErrors={wizard.modelErrors}
          />
        )}
      </Panel>

      {/* ============================ Navigation ======================== */}
      {/* The action bar under the card; Continue / Generate Post is the view's
          one primary (the floating Create post button is hidden here). */}
      <div className="flex items-center justify-between gap-3 mt-5">
        <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0 || submitting}>
          <ChevronLeft {...ICON} aria-hidden /> Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!wizard.stepValid(step)}>
            Continue <ChevronRight {...ICON} aria-hidden />
          </Button>
        ) : (
          <Button onClick={wizard.handleGenerate} disabled={submitting || !wizard.copyProviderReady}>
            {submitting ? <><Loader2 {...ICON} aria-hidden className="animate-spin" /> Generating…</> : <><Sparkles {...ICON} aria-hidden /> Generate Post</>}
          </Button>
        )}
      </div>
    </div>
  )
}
