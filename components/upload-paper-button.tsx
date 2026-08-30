"use client"

import { useState } from "react"
import { uploadPaperAction } from "@/app/dashboard/actions"

export function UploadPaperButton() {
    const [isOpen, setIsOpen] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault()
        setIsUploading(true)
        setError(null)

        const formData = new FormData(e.currentTarget)

        // Server action call
        const result = await uploadPaperAction(formData)

        setIsUploading(false)
        if (result.error) {
            setError(result.error)
        } else {
            setIsOpen(false)
        }
    }

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md font-medium hover:bg-primary/90 transition-colors"
            >
                + Upload Paper
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-card text-card-foreground w-full max-w-md p-6 rounded-xl shadow-2xl relative">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
                        >
                            ✕
                        </button>
                        <h2 className="text-xl font-bold mb-4">Upload JEE Paper</h2>

                        {error && <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md mb-4">{error}</div>}

                        <form onSubmit={handleSubmit} className="flex flex-col space-y-4">
                            <div className="flex flex-col space-y-2">
                                <label className="text-sm font-medium" htmlFor="title">Paper Title (e.g. JEE Main 2023 Session 1)</label>
                                <input required id="title" name="title" className="border border-input bg-transparent px-3 py-2 rounded-md text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
                            </div>

                            <div className="flex flex-col space-y-2">
                                <label className="text-sm font-medium" htmlFor="year">Year</label>
                                <input required type="number" min="2000" max="2030" id="year" name="year" defaultValue={new Date().getFullYear()} className="border border-input bg-transparent px-3 py-2 rounded-md text-sm focus:ring-2 focus:ring-ring focus:outline-none" />
                            </div>

                            <div className="flex flex-col space-y-2">
                                <label className="text-sm font-medium" htmlFor="file">PDF File</label>
                                <input required type="file" accept="application/pdf" id="file" name="file" className="border border-input bg-transparent px-3 py-2 rounded-md text-sm file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-secondary file:text-secondary-foreground" />
                            </div>

                            <div className="pt-2 flex justify-end space-x-2">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 text-sm font-medium hover:bg-secondary rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isUploading}
                                    className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center"
                                >
                                    {isUploading ? "Uploading..." : "Upload & Save"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
