
import { GetServerSideProps } from "next";

export default function EventRedirect() {
    return null;
}

export const getServerSideProps: GetServerSideProps = async (context) => {
    const { eventId } = context.params || {};

    // Forward all query parameters
    const queryParams = new URLSearchParams(context.query as Record<string, string>);
    // Remove the 'eventId' from the query params if it exists, as it's part of the path
    queryParams.delete('eventId');

    const queryString = queryParams.toString();
    const destination = `/${eventId}${queryString ? `?${queryString}` : ''}`;

    return {
        redirect: {
            destination,
            permanent: false, // Use temporary redirect to allow for future changes
        },
    };
};
