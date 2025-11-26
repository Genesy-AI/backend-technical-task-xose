export async function verifyEmail(email: string): Promise<boolean> {
    if (email.includes('john.doe')) {
        // Now we are forcing an error to test how the system reacts to it
        throw new Error("Forced error");
    }

    if (email.includes('jane.smith')) {
        await new Promise((resolve) => setTimeout(resolve, 20000));
    }

    if (/\+/.test(email)) {
        return false;
    }

    return true;
}